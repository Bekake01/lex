import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  lockedViewSchema,
  signerViewSchema,
  type Field,
  type SubmitSigningBody,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { recipients } from '../src/db/schema/index.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { SignatureRequestsService } from '../src/signature-requests/signature-requests.service.js';
import { SigningService } from '../src/signing/signing.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { makePdf } from './helpers/doc-fixtures.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const queue = { add: async () => ({}) } as unknown as Queue;

const field = (type: Field['type'], required = true): Field => ({
  id: randomUUID(),
  type,
  page: 1,
  x: 0.1,
  y: 0.5,
  w: 0.3,
  h: 0.04,
  required,
});

describe('public signing API', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let documents: DocumentsService;
  let sender: SignatureRequestsService;
  let signing: SigningService;
  let user: CurrentUser;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-sign-public-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    documents = new DocumentsService(db, storage);
    const env = {
      SIGN_APP_URL: 'http://localhost:3001',
      SUMMARY_WAIT_MS: 0,
      SIGN_TICKET_SECRET: 'test-ticket-secret-0123456789abcdef',
    } as Env;
    sender = new SignatureRequestsService(
      db,
      env,
      documents,
      storage,
      queue,
      queue,
    );
    signing = new SigningService(db, env, storage, queue);
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
  });

  const nameField = field('name');
  const fields = [field('signature'), nameField, field('date')];

  /** A sent send with one invited person; returns its id and that person's token. */
  async function sent(options: { password?: string; openLink?: boolean } = {}) {
    const doc = await documents.upload(user, {
      name: 'ijara.pdf',
      contentType: 'application/pdf',
      bytes: makePdf([['Ijara shartnomasi']]),
    });
    const draft = await sender.createDraft(user, { documentId: doc.id });
    await sender.updateDraft(user, draft.id, {
      fields,
      recipients: [
        { name: 'Dilnoza', channel: 'email', contact: 'd@example.com' },
      ],
    });
    if (options.password || options.openLink) {
      await sender.updateAccess(user, draft.id, {
        password: options.password,
        openLinkEnabled: options.openLink,
      });
    }
    const response = await sender.send(user, draft.id);
    const token = response.recipients[0].signUrl.split('/sign/')[1];
    return { id: draft.id, token, openLinkUrl: response.openLinkUrl };
  }

  const body = (
    values: Record<string, string> = { [nameField.id]: 'Dilnoza Yusupova' },
  ): SubmitSigningBody => ({
    signerName: 'Dilnoza Yusupova',
    signature: { method: 'drawn', image: PNG },
    fieldValues: values,
    agreed: true,
  });

  it('view → submit → second submit is 404; the link still opens as signed', async () => {
    const { token } = await sent();

    const view = signerViewSchema.parse(await signing.view(token));
    expect(view).toMatchObject({
      signed: false,
      recipientName: 'Dilnoza',
      hasSummary: false,
    });
    expect(view.fields).toHaveLength(3);
    const [row] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.token, token));
    expect(row.status).toBe('viewed');

    expect(await signing.document(token)).toBeInstanceOf(Uint8Array);
    expect(
      await signing.submit(token, undefined, body(), '203.0.113.7', 'test-ua'),
    ).toEqual({ ok: true });

    const [signed] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.token, token));
    expect(signed).toMatchObject({
      status: 'signed',
      signerName: 'Dilnoza Yusupova',
      signerIp: '203.0.113.7',
    });
    // The signing date is the server's, not anything the client sent.
    expect(signed.fieldValues[fields[2].id]).toBe(
      new Date().toISOString().slice(0, 10),
    );
    expect(await storage.get(signed.signatureImageKey!)).toBeInstanceOf(
      Uint8Array,
    );

    await expect(
      signing.submit(token, undefined, body(), null, null),
    ).rejects.toMatchObject({ status: 404 });
    expect((await signing.view(token)) as { signed: boolean }).toMatchObject({
      signed: true,
    });
    expect(await signing.status(token)).toEqual({ ready: false });
    await expect(
      signing.file(token, undefined, 'signed'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a missing required field or a bad PNG is the uniform 404', async () => {
    const { token } = await sent();
    await expect(
      signing.submit(token, undefined, body({}), null, null),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      signing.submit(
        token,
        undefined,
        {
          ...body(),
          signature: { method: 'typed', image: 'data:image/png;base64,bm90' },
        },
        null,
        null,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a cancelled send, a draft and an unknown token are all 404', async () => {
    const { id, token } = await sent();
    await sender.cancel(user, id);
    await expect(signing.view(token)).rejects.toMatchObject({ status: 404 });
    await expect(signing.view('x'.repeat(43))).rejects.toMatchObject({
      status: 404,
    });

    const doc = await documents.upload(user, {
      name: 'a.pdf',
      contentType: 'application/pdf',
      bytes: makePdf([['a']]),
    });
    const draft = await sender.createDraft(user, { documentId: doc.id });
    const withPeople = await sender.updateDraft(user, draft.id, {
      recipients: [{ channel: 'link' }],
    });
    const draftToken = withPeople.recipients[0].signUrl.split('/sign/')[1];
    await expect(signing.view(draftToken)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('password: locked view, wrong ×10 → 423, right → a ticket that works', async () => {
    const { id, token } = await sent({ password: 'parol123' });

    expect(lockedViewSchema.parse(await signing.view(token))).toEqual({
      locked: true,
      title: 'ijara',
    });
    await expect(signing.summaryForToken(token)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      signing.submit(token, undefined, body(), null, null),
    ).rejects.toMatchObject({ status: 404 });

    const { ticket } = await signing.unlock(token, 'parol123');
    expect(
      signerViewSchema.safeParse(await signing.view(token, ticket)).success,
    ).toBe(true);
    await expect(signing.view(token, `${ticket}x`)).resolves.toMatchObject({
      locked: true,
    });

    for (let i = 0; i < 10; i++) {
      await expect(signing.unlock(token, 'wrong')).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(signing.unlock(token, 'parol123')).rejects.toMatchObject({
      status: 423,
    });

    // The sender changing the password unlocks the link.
    await sender.updateAccess(user, id, { password: 'yangi-parol' });
    await expect(signing.unlock(token, 'yangi-parol')).resolves.toHaveProperty(
      'ticket',
    );
  });

  it('open link: info, start makes a new copy, wrong password is 401', async () => {
    const { id, openLinkUrl } = await sent({
      openLink: true,
      password: 'parol123',
    });
    const publicToken = openLinkUrl!.split('/open/')[1];

    expect(await signing.openLinkInfo(publicToken)).toEqual({
      title: 'ijara',
      senderName: 'Test Sender',
      needsPassword: true,
    });
    await expect(
      signing.openLinkStart(publicToken, { name: 'Akmal', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 });

    const started = await signing.openLinkStart(publicToken, {
      name: 'Akmal Karimov',
      phone: '+998 90 111 22 33',
      password: 'parol123',
    });
    expect(started.ticket).toBeTruthy();
    const view = await signing.view(started.token, started.ticket);
    expect(view).toMatchObject({
      recipientName: 'Akmal Karimov',
      signed: false,
    });

    const detail = await sender.detail(user, id);
    expect(
      detail.recipients.find((r) => r.source === 'open_link'),
    ).toMatchObject({
      name: 'Akmal Karimov',
      channel: 'link',
      contact: '+998901112233',
    });

    // Open link off → the public link is gone; the started copy keeps working.
    await sender.updateAccess(user, id, { openLinkEnabled: false });
    await expect(signing.openLinkInfo(publicToken)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      signing.view(started.token, started.ticket),
    ).resolves.toMatchObject({ signed: false });
  });
});
