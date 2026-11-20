import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  signingRequestDetailWireSchema,
  signingRequestListSchema,
  sendSigningResponseSchema,
  type Field,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { recipients, signatureRequests } from '../src/db/schema/index.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { SignatureRequestsService } from '../src/signature-requests/signature-requests.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { makePdf } from './helpers/doc-fixtures.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

function fakeQueue(): Queue & { added: { data: unknown; jobId?: string }[] } {
  const added: { data: unknown; jobId?: string }[] = [];
  return {
    added,
    add: async (_name: string, data: unknown, opts?: { jobId?: string }) => {
      added.push({ data, jobId: opts?.jobId });
      return {} as never;
    },
  } as unknown as Queue & { added: { data: unknown; jobId?: string }[] };
}

const field = (type: Field['type'], page = 1): Field => ({
  id: randomUUID(),
  type,
  page,
  x: 0.1,
  y: 0.8,
  w: 0.3,
  h: 0.05,
  required: true,
});

describe('sender signing API', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let documents: DocumentsService;
  let service: SignatureRequestsService;
  let summarize: ReturnType<typeof fakeQueue>;
  let invite: ReturnType<typeof fakeQueue>;
  let user: CurrentUser;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-signing-'));
    const storage = new StorageService({ STORAGE_DIR: dir } as Env);
    documents = new DocumentsService(db, storage);
    summarize = fakeQueue();
    invite = fakeQueue();
    service = new SignatureRequestsService(
      db,
      {
        SIGN_APP_URL: 'http://localhost:3001/',
        SUMMARY_WAIT_MS: 60_000,
      } as Env,
      documents,
      storage,
      summarize,
      invite,
    );
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
    summarize.added.length = 0;
    invite.added.length = 0;
  });

  async function pdfDraft() {
    const doc = await documents.upload(user, {
      name: 'ijara-shartnomasi.pdf',
      contentType: 'application/pdf',
      bytes: makePdf([['Ijara shartnomasi'], ['2-sahifa']]),
    });
    return service.createDraft(user, { documentId: doc.id });
  }

  it('draft → patch → access → send → list → detail → add → cancel', async () => {
    const draft = await pdfDraft();
    expect(signingRequestDetailWireSchema.parse(draft)).toBeTruthy();
    expect(draft).toMatchObject({
      status: 'draft',
      title: 'ijara-shartnomasi',
      pageCount: 2,
      recipients: [],
    });
    expect(draft.pageSizes).toHaveLength(2);

    const sig = field('signature', 2);
    const patched = await service.updateDraft(user, draft.id, {
      message: 'Iltimos, imzolang',
      fields: [field('name'), sig],
      recipients: [
        { name: 'Dilnoza', channel: 'email', contact: ' Dilnoza@Example.com ' },
        { channel: 'sms', contact: '+998 90 123-45-67' },
        { channel: 'telegram', contact: '@javlon_r' },
        { channel: 'link' },
      ],
    });
    expect(patched.fields).toHaveLength(2);
    expect(patched.recipients.map((r) => r.contact)).toEqual([
      'dilnoza@example.com',
      '+998901234567',
      '@javlon_r',
      null,
    ]);

    // Replacing the list replaces the rows.
    const replaced = await service.updateDraft(user, draft.id, {
      recipients: [
        { name: 'Dilnoza', channel: 'email', contact: 'dilnoza@example.com' },
        { channel: 'link' },
      ],
    });
    expect(replaced.recipients).toHaveLength(2);

    const access = await service.updateAccess(user, draft.id, {
      openLinkEnabled: true,
      password: 'parol123',
    });
    expect(access.hasPassword).toBe(true);
    expect(access.openLinkUrl).toMatch(
      /^http:\/\/localhost:3001\/open\/[\w-]{43}$/,
    );

    const sent = await service.send(user, draft.id);
    expect(sendSigningResponseSchema.parse(sent)).toBeTruthy();
    expect(sent.recipients).toHaveLength(2);
    expect(sent.recipients[0].signUrl).toMatch(
      /^http:\/\/localhost:3001\/sign\//,
    );
    expect(sent.openLinkUrl).toBe(access.openLinkUrl);
    expect(summarize.added.map((j) => j.jobId)).toEqual([
      `summarize.${draft.id}`,
    ]);
    expect(invite.added.map((j) => j.jobId)).toEqual([`invite.${draft.id}`]);

    // A sent draft can't be edited, or sent again.
    await expect(
      service.updateDraft(user, draft.id, { title: 'x' }),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.send(user, draft.id)).rejects.toMatchObject({
      status: 409,
    });

    const list = await service.list(user, 'sent');
    expect(signingRequestListSchema.parse(list)).toBeTruthy();
    expect(list.requests[0]).toMatchObject({
      id: draft.id,
      status: 'sent',
      recipientCount: 2,
      signedCount: 0,
    });

    // One person signed: counts and detail order follow.
    const [first] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.signatureRequestId, draft.id));
    await db
      .update(recipients)
      .set({
        status: 'signed',
        signedAt: new Date(),
        signerName: 'Dilnoza Yusupova',
      })
      .where(eq(recipients.id, first.id));
    expect((await service.list(user, 'sent')).requests[0].signedCount).toBe(1);
    const detail = await service.detail(user, draft.id);
    expect(detail.recipients[0]).toMatchObject({
      id: first.id,
      status: 'signed',
      ready: false,
    });

    // Not sealed yet → no download.
    await expect(
      service.download(user, draft.id, first.id, 'signed'),
    ).rejects.toMatchObject({ status: 404 });

    const added = await service.addRecipients(user, draft.id, {
      recipients: [{ name: 'Akmal', channel: 'sms', contact: '+998901112233' }],
    });
    expect(added.recipients).toHaveLength(1);
    expect(invite.added[1].jobId).toBe(
      `invite.${draft.id}.${added.recipients[0].id}`,
    );
    expect(invite.added[1].data).toMatchObject({
      recipientIds: [added.recipients[0].id],
    });

    const cancelled = await service.cancel(user, draft.id);
    expect(cancelled.status).toBe('cancelled');
    await expect(
      service.addRecipients(user, draft.id, {
        recipients: [{ channel: 'link' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a DOCX draft with 415 PDF_ONLY', async () => {
    const doc = await documents.upload(user, {
      name: 'ijara.docx',
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: new Uint8Array([0x50, 0x4b, 3, 4]),
    });
    await expect(
      service.createDraft(user, { documentId: doc.id }),
    ).rejects.toMatchObject({
      status: 415,
      response: { code: 'PDF_ONLY' },
    });
  });

  it('send needs a signature field and someone to sign', async () => {
    const draft = await pdfDraft();
    await expect(service.send(user, draft.id)).rejects.toMatchObject({
      status: 422,
      response: { code: 'NEEDS_SIGNATURE_FIELD' },
    });
    await service.updateDraft(user, draft.id, { fields: [field('signature')] });
    await expect(service.send(user, draft.id)).rejects.toMatchObject({
      status: 422,
      response: { code: 'NEEDS_RECIPIENTS' },
    });
    // The open link alone is enough.
    await service.updateAccess(user, draft.id, { openLinkEnabled: true });
    const sent = await service.send(user, draft.id);
    expect(sent.recipients).toEqual([]);
    expect(sent.openLinkUrl).not.toBeNull();
  });

  it('rejects a field past the last page', async () => {
    const draft = await pdfDraft();
    await expect(
      service.updateDraft(user, draft.id, { fields: [field('signature', 3)] }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_FIELDS' } });
  });

  it("someone else's send is a 404", async () => {
    const draft = await pdfDraft();
    const other = await seedUser(db);
    await expect(service.detail(other, draft.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('inbox lists sent sends where my email is a recipient', async () => {
    const me = await seedUser(db, { email: `me-${Date.now()}@example.com` });
    const [meRow] = await db.query.users.findMany({
      where: (u, { eq }) => eq(u.id, me.id),
    });
    const draft = await pdfDraft();
    await service.updateDraft(user, draft.id, {
      fields: [field('signature')],
      recipients: [
        { name: 'Men', channel: 'email', contact: meRow.email.toUpperCase() },
      ],
    });
    expect((await service.list(me, 'inbox')).requests).toEqual([]); // still a draft
    await service.send(user, draft.id);

    const inbox = await service.list(me, 'inbox');
    expect(signingRequestListSchema.parse(inbox)).toBeTruthy();
    expect(inbox.requests).toHaveLength(1);
    expect(inbox.requests[0]).toMatchObject({
      id: draft.id,
      senderName: 'Test Sender',
      openLinkUrl: null,
      mine: { status: 'pending' },
    });

    await db
      .update(signatureRequests)
      .set({ status: 'cancelled' })
      .where(eq(signatureRequests.id, draft.id));
    expect((await service.list(me, 'inbox')).requests).toEqual([]);
  });
});
