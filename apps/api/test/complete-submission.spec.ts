import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Field } from '@lex/contracts';
import { generateSealRing, SealService, sha256 } from '@lex/crypto';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { recipients, signatureRequests } from '../src/db/schema/index.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { SignatureRequestsService } from '../src/signature-requests/signature-requests.service.js';
import { CompleteSubmissionProcessor } from '../src/signing/jobs/complete-submission.processor.js';
import { SigningService } from '../src/signing/signing.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { makePdf } from './helpers/doc-fixtures.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

function capturingQueue(): Queue & {
  added: { data: unknown; jobId?: string }[];
} {
  const added: { data: unknown; jobId?: string }[] = [];
  return {
    added,
    add: async (_n: string, data: unknown, opts?: { jobId?: string }) => {
      added.push({ data, jobId: opts?.jobId });
      return {} as never;
    },
  } as unknown as Queue & { added: { data: unknown; jobId?: string }[] };
}

const field = (type: Field['type']): Field => ({
  id: randomUUID(),
  type,
  page: 1,
  x: 0.1,
  y: 0.6,
  w: 0.4,
  h: 0.05,
  required: true,
});

describe('complete-submission job', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let user: CurrentUser;
  let sender: SignatureRequestsService;
  let signing: SigningService;
  let completeQueue: ReturnType<typeof capturingQueue>;
  let seal: SealService;
  let processor: CompleteSubmissionProcessor;
  let documentId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-complete-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    const documents = new DocumentsService(db, storage);
    const env = {
      SIGN_APP_URL: 'http://localhost:3001',
      SUMMARY_WAIT_MS: 0,
      SIGN_TICKET_SECRET: 'test-ticket-secret-0123456789abcdef',
    } as Env;
    const noQueue = { add: async () => ({}) } as unknown as Queue;
    completeQueue = capturingQueue();
    sender = new SignatureRequestsService(
      db,
      env,
      documents,
      storage,
      noQueue,
      noQueue,
    );
    signing = new SigningService(db, env, storage, completeQueue);
    seal = new SealService(generateSealRing('seal-test'));
    processor = new CompleteSubmissionProcessor(
      db,
      storage,
      seal,
      completeQueue,
    );
    user = await seedUser(db);

    const doc = await documents.upload(user, {
      name: 'ijara.pdf',
      contentType: 'application/pdf',
      bytes: makePdf([['Ijara shartnomasi']]),
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  it('seals a signed copy once: files, hash, seal, ready', async () => {
    const nameField = field('name');
    const draft = await sender.createDraft(user, { documentId });
    await sender.updateDraft(user, draft.id, {
      fields: [field('signature'), nameField, field('date')],
      recipients: [
        { name: 'Şoira', channel: 'telegram', contact: '@shoira_g' },
      ],
    });
    const sent = await sender.send(user, draft.id);
    const token = sent.recipients[0].signUrl.split('/sign/')[1];

    await signing.submit(
      token,
      undefined,
      {
        signerName: 'Şoira Ğulomova Oʻktamovna',
        signature: { method: 'drawn', image: PNG },
        fieldValues: { [nameField.id]: 'Şoira Ğulomova Oʻktamovna' },
        agreed: true,
      },
      '203.0.113.7',
      'test-ua',
    );
    const recipientId = sent.recipients[0].id;
    expect(completeQueue.added).toEqual([
      expect.objectContaining({
        jobId: `complete.${recipientId}`,
        data: { recipientId },
      }),
    ]);
    expect(await signing.status(token)).toEqual({ ready: false });

    await processor.complete(recipientId);
    const [row] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.id, recipientId));
    expect(row.signedPdfKey).toBe(`signed/${draft.id}/${recipientId}.pdf`);
    expect(row.certificateKey).toBe(
      `certificates/${draft.id}/${recipientId}.pdf`,
    );

    const signedPdf = await storage.get(row.signedPdfKey!);
    expect(sha256(signedPdf)).toBe(row.signedHash);
    expect((await PDFDocument.load(signedPdf)).getPageCount()).toBe(1);
    const certificate = await storage.get(row.certificateKey!);
    expect(Buffer.from(certificate.subarray(0, 5)).toString()).toBe('%PDF-');

    // The seal verifies against the stored facts — and only those.
    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, draft.id));
    const payload = {
      requestId: draft.id,
      recipientId,
      signedAt: row.signedAt!,
      signedHash: row.signedHash!,
      documentHash: request.documentHash,
      summaryHash: request.summaryHash,
    };
    expect(seal.verify(payload, row.sealSignature!, row.sealKid!)).toBe(true);
    expect(
      seal.verify(
        { ...payload, recipientId: randomUUID() },
        row.sealSignature!,
        row.sealKid!,
      ),
    ).toBe(false);

    expect(await signing.status(token)).toEqual({ ready: true });
    const download = await signing.file(token, undefined, 'signed');
    expect(sha256(download.bytes)).toBe(row.signedHash);
    expect((await sender.detail(user, draft.id)).recipients[0].ready).toBe(
      true,
    );
    const senderCopy = await sender.download(
      user,
      draft.id,
      recipientId,
      'certificate',
    );
    expect(senderCopy.fileName).toBe(
      'ijara — Şoira Ğulomova Oʻktamovna — sertifikat.pdf',
    );

    // Running it again changes nothing.
    await processor.complete(recipientId);
    const [again] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.id, recipientId));
    expect(again.signedHash).toBe(row.signedHash);
    expect(again.sealSignature).toBe(row.sealSignature);
    expect(sha256(await storage.get(again.signedPdfKey!))).toBe(row.signedHash);
  });

  it('fails loudly without seal keys, and does nothing for an unsigned copy', async () => {
    const draft = await sender.createDraft(user, { documentId });
    await sender.updateDraft(user, draft.id, {
      fields: [field('signature')],
      recipients: [{ channel: 'link' }],
    });
    const sent = await sender.send(user, draft.id);
    const recipientId = sent.recipients[0].id;

    // Not signed yet: a no-op, even without keys.
    const noKeys = new CompleteSubmissionProcessor(
      db,
      storage,
      null,
      completeQueue,
    );
    await expect(noKeys.complete(recipientId)).resolves.toBeUndefined();

    const token = sent.recipients[0].signUrl.split('/sign/')[1];
    await signing.submit(
      token,
      undefined,
      {
        signerName: 'Akmal',
        signature: { method: 'typed', image: PNG },
        fieldValues: {},
        agreed: true,
      },
      null,
      null,
    );
    await expect(noKeys.complete(recipientId)).rejects.toThrow(/SEAL_KEYS/);
  });
});
