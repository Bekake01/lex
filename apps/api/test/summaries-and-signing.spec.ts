import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiService, StructuredCall } from '../src/ai-review/ai.service.js';
import { emptyUsage } from '../src/ai-review/ai.service.js';
import { DocumentContentService } from '../src/ai-review/document-content.service.js';
import { SummarizeForRecipientsProcessor } from '../src/ai-review/jobs/summarize-for-recipients.processor.js';
import { hashJson } from '../src/common/hash.js';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import {
  recipientSummaries,
  recipients,
  signatureRequests,
} from '../src/db/schema/index.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { FakeDocProcessingService } from '../src/law-search/fake-doc-processing.service.js';
import type {
  SendSigningInviteJob,
  SummarizeForRecipientsJob,
} from '../src/queue/queue.constants.js';
import { SendSigningInviteProcessor } from '../src/signature-requests/jobs/send-signing-invite.processor.js';
import { SignatureRequestsService } from '../src/signature-requests/signature-requests.service.js';
import { SigningService } from '../src/signing/signing.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const CONTRACT = `1. Ijaraga oluvchi har oyning 5-sanasiga qadar 5 000 000 so'm to'laydi.
2. Ijaraga beruvchi binoni 1-fevralga qadar topshiradi.
3. Kechiktirilgan har kun uchun 0,1% penya.`;

function env(overrides: Partial<Env> = {}): Env {
  return {
    SIGN_APP_URL: 'http://localhost:3001',
    SUMMARY_WAIT_MS: 60_000,
    AI_REVIEWS_LIMIT_PERSONAL: 20,
    AI_REVIEWS_LIMIT_AGENCY: 200,
    ...overrides,
  } as Env;
}

function fakeQueue(): Queue & { added: unknown[] } {
  const added: unknown[] = [];
  return {
    added,
    add: async (_name: string, data: unknown) => {
      added.push(data);
      return {} as never;
    },
  } as unknown as Queue & { added: unknown[] };
}

/** One canned summary per party, so the party split is observable. */
function stubAi(parties: string[] = []) {
  return {
    model: 'claude-opus-5-5',
    promptVersion: 'test',
    configured: true,
    structured: async <T>(call: StructuredCall<T>) => {
      const partyBlock = call.content.find(
        (block): block is { type: 'text'; text: string } =>
          block.type === 'text' &&
          block.text.includes('writing for this party'),
      );
      const partyName = partyBlock?.text.match(/"([^"]+)"/)?.[1] ?? 'unknown';
      parties.push(partyName);

      return {
        output: {
          overview: `Bu ijara shartnomasi. Siz ${partyName} sifatida imzolaysiz.`,
          yourObligations: [
            {
              text: "Har oyning 5-sanasiga qadar 5 000 000 so'm to'lash",
              deadline: 'har oyning 5-sanasi',
              penalty: 'kuniga 0,1% penya',
              clauseRef: '1',
            },
          ],
          otherObligations: [
            {
              text: 'Binoni topshirish',
              deadline: '1-fevral',
              penalty: null,
              clauseRef: '2',
            },
          ],
          keyConditions: [{ label: 'Ijara haqi', value: "5 000 000 so'm" }],
        } as T,
        usage: {
          ...emptyUsage(),
          inputTokens: 500,
          outputTokens: 100,
          costUsd: 0.004,
        },
        model: 'claude-opus-5-5',
      };
    },
  } as unknown as AiService;
}

describe('summaries and the signing page', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let documents: DocumentsService;
  let content: DocumentContentService;
  let usage: AiUsageService;
  let signing: SigningService;
  let user: CurrentUser;
  let documentId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-summary-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    documents = new DocumentsService(db, storage);
    content = new DocumentContentService(
      db,
      new FakeDocProcessingService(),
      storage,
    );
    usage = new AiUsageService(db, env());
    signing = new SigningService(db);
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
    const document = await documents.upload(user, {
      name: 'ijara.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode(CONTRACT),
    });
    documentId = document.id;
  });

  async function send(options: { partyNames?: (string | undefined)[] } = {}) {
    const summarize = fakeQueue();
    const invite = fakeQueue();
    const service = new SignatureRequestsService(
      db,
      env(),
      documents,
      summarize,
      invite,
    );
    const names = options.partyNames ?? ['Dilnoza Yusupova'];
    const response = await service.create(user, {
      documentId,
      recipients: names.map((partyName, i) => ({
        email: `Signer${i}@Example.com`,
        fullName: `Signer ${i}`,
        partyName,
      })),
    });
    return { response, summarize, invite };
  }

  function summarizer(parties: string[] = []) {
    return new SummarizeForRecipientsProcessor(
      db,
      stubAi(parties),
      content,
      usage,
    );
  }

  const job = <T>(data: T, attemptsMade = 0) =>
    ({ data, attemptsMade, opts: { attempts: 3 } }) as Job<T>;

  it('enqueues the summaries before the invite, and the invite carries a deadline', async () => {
    const { response, summarize, invite } = await send();

    expect(summarize.added).toHaveLength(1);
    expect(summarize.added[0]).toMatchObject({
      signatureRequestId: response.signatureRequestId,
      language: 'uz',
    });
    const invitePayload = invite.added[0] as SendSigningInviteJob;
    expect(invitePayload.summaryDeadline).toBeGreaterThan(Date.now());
    expect(response.recipients[0].signUrl).toMatch(
      /^http:\/\/localhost:3001\/sign\/[\w-]{20,}$/,
    );
    // Emails are normalised on the way in.
    expect(response.recipients[0].email).toBe('signer0@example.com');
  });

  it('writes one summary per recipient and a hash over all of them', async () => {
    const { response } = await send();
    await summarizer().process(
      job<SummarizeForRecipientsJob>({
        signatureRequestId: response.signatureRequestId,
        language: 'uz',
      }),
    );

    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, response.signatureRequestId));
    expect(request.summariesStatus).toBe('done');
    expect(request.summaryHash).toMatch(/^[0-9a-f]{64}$/);

    const rows = await db
      .select()
      .from(recipientSummaries)
      .where(
        eq(recipientSummaries.signatureRequestId, response.signatureRequestId),
      );
    expect(rows).toHaveLength(1);
    // The per-recipient hash is the hash of exactly the stored body.
    expect(rows[0].summaryHash).toBe(hashJson(rows[0].body));
  });

  it('makes one Claude call per party, not per recipient', async () => {
    const { response } = await send({
      partyNames: ['Dilnoza Yusupova', 'Dilnoza Yusupova', 'Alisher Karimov'],
    });
    const parties: string[] = [];
    await summarizer(parties).process(
      job<SummarizeForRecipientsJob>({
        signatureRequestId: response.signatureRequestId,
        language: 'uz',
      }),
    );

    expect(parties.sort()).toEqual(['Alisher Karimov', 'Dilnoza Yusupova']);
    const rows = await db
      .select()
      .from(recipientSummaries)
      .where(
        eq(recipientSummaries.signatureRequestId, response.signatureRequestId),
      );
    expect(rows).toHaveLength(3);
  });

  it('is idempotent on re-delivery', async () => {
    const { response } = await send();
    const parties: string[] = [];
    const worker = summarizer(parties);
    const payload = job<SummarizeForRecipientsJob>({
      signatureRequestId: response.signatureRequestId,
      language: 'uz',
    });

    await worker.process(payload);
    await worker.process(payload);

    expect(parties).toHaveLength(1);
    const rows = await db
      .select()
      .from(recipientSummaries)
      .where(
        eq(recipientSummaries.signatureRequestId, response.signatureRequestId),
      );
    expect(rows).toHaveLength(1);
  });

  it('falls back to the recipient name when no party was mapped', async () => {
    const { response } = await send({ partyNames: [undefined] });
    const parties: string[] = [];
    await summarizer(parties).process(
      job<SummarizeForRecipientsJob>({
        signatureRequestId: response.signatureRequestId,
        language: 'uz',
      }),
    );
    expect(parties).toEqual(['Signer 0']);
  });

  describe('GET /sign/:token/summary', () => {
    async function sentWithSummaries() {
      const { response } = await send();
      await summarizer().process(
        job<SummarizeForRecipientsJob>({
          signatureRequestId: response.signatureRequestId,
          language: 'uz',
        }),
      );
      const [recipient] = await db
        .select()
        .from(recipients)
        .where(eq(recipients.signatureRequestId, response.signatureRequestId));
      return { response, recipient };
    }

    it('returns the stored summary and records the first view', async () => {
      const { recipient } = await sentWithSummaries();
      const wire = await signing.summaryForToken(recipient.token);

      expect(wire.partyName).toBe('Dilnoza Yusupova');
      expect(wire.language).toBe('uz');
      expect(wire.yourObligations[0]).toMatchObject({
        clauseRef: '1',
        deadline: 'har oyning 5-sanasi',
      });
      // An obligation with no penalty leaves the field out rather than null.
      expect(wire.otherObligations[0].penalty).toBeUndefined();

      const [viewed] = await db
        .select()
        .from(recipients)
        .where(eq(recipients.id, recipient.id));
      expect(viewed.status).toBe('viewed');
      expect(viewed.viewedAt).not.toBeNull();
    });

    it('can be opened many times', async () => {
      const { recipient } = await sentWithSummaries();
      await signing.summaryForToken(recipient.token);
      await expect(
        signing.summaryForToken(recipient.token),
      ).resolves.toBeTruthy();
    });

    it('gives the same 404 for an unknown token', async () => {
      await expect(
        signing.summaryForToken('x'.repeat(43)),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Not found',
      });
    });

    it('gives the same 404 for a short or empty token', async () => {
      await expect(signing.summaryForToken('')).rejects.toMatchObject({
        status: 404,
        message: 'Not found',
      });
    });

    it('closes the link once the recipient has signed', async () => {
      const { recipient } = await sentWithSummaries();
      await db
        .update(recipients)
        .set({ status: 'signed', signedAt: new Date() })
        .where(eq(recipients.id, recipient.id));

      await expect(
        signing.summaryForToken(recipient.token),
      ).rejects.toMatchObject({ status: 404, message: 'Not found' });
    });

    it('gives the same 404 for a cancelled request', async () => {
      const { response, recipient } = await sentWithSummaries();
      await db
        .update(signatureRequests)
        .set({ status: 'cancelled' })
        .where(eq(signatureRequests.id, response.signatureRequestId));

      await expect(
        signing.summaryForToken(recipient.token),
      ).rejects.toMatchObject({ status: 404, message: 'Not found' });
    });

    it('gives the same 404 when no summary was stored', async () => {
      const { response } = await send();
      const [recipient] = await db
        .select()
        .from(recipients)
        .where(eq(recipients.signatureRequestId, response.signatureRequestId));

      await expect(
        signing.summaryForToken(recipient.token),
      ).rejects.toMatchObject({ status: 404, message: 'Not found' });
    });
  });

  describe('the invite job', () => {
    function inviter() {
      const service = new SignatureRequestsService(
        db,
        env(),
        documents,
        fakeQueue(),
        fakeQueue(),
      );
      return new SendSigningInviteProcessor(db, service);
    }

    it('waits while the summaries are still running', async () => {
      const { response } = await send();
      let delayedUntil = 0;
      const inviteJob = {
        data: {
          signatureRequestId: response.signatureRequestId,
          summaryDeadline: Date.now() + 60_000,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        moveToDelayed: async (at: number) => {
          delayedUntil = at;
        },
      } as unknown as Job<SendSigningInviteJob>;

      await expect(
        inviter().process(inviteJob, 'token'),
      ).rejects.toBeInstanceOf(DelayedError);
      expect(delayedUntil).toBeGreaterThan(Date.now());

      const [request] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, response.signatureRequestId));
      expect(request.sentAt).toBeNull();
    });

    it('sends without summaries once the deadline passes', async () => {
      const { response } = await send();
      await inviter().process(
        job<SendSigningInviteJob>({
          signatureRequestId: response.signatureRequestId,
          summaryDeadline: Date.now() - 1,
        }),
      );

      const [request] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, response.signatureRequestId));
      expect(request.status).toBe('sent');
      expect(request.sentAt).not.toBeNull();
    });

    it('sends straight away once the summaries are done, and only once', async () => {
      const { response } = await send();
      await summarizer().process(
        job<SummarizeForRecipientsJob>({
          signatureRequestId: response.signatureRequestId,
          language: 'uz',
        }),
      );

      const worker = inviter();
      const payload = job<SendSigningInviteJob>({
        signatureRequestId: response.signatureRequestId,
        summaryDeadline: Date.now() + 60_000,
      });
      await worker.process(payload);
      const [first] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, response.signatureRequestId));

      await worker.process(payload);
      const [second] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, response.signatureRequestId));

      expect(first.sentAt).not.toBeNull();
      expect(second.sentAt?.getTime()).toBe(first.sentAt?.getTime());
    });
  });
});
