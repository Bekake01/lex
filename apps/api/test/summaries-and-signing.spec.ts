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
  aiReviews,
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
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const CONTRACT = `1. Ijaraga oluvchi har oyning 5-sanasiga qadar 5 000 000 so'm to'laydi.
2. Ijaraga beruvchi binoni 1-fevralga qadar topshiradi.
3. Kechiktirilgan har kun uchun 0,1% penya.`;

function env(): Env {
  return {
    SIGN_APP_URL: 'http://localhost:3001',
    SUMMARY_WAIT_MS: 60_000,
    AI_REVIEWS_LIMIT_PERSONAL: 20,
    AI_REVIEWS_LIMIT_AGENCY: 200,
  } as Env;
}

const noQueue = { add: async () => ({}) } as unknown as Queue;

/** A canned summary that names the party it was written for. */
function stubAi(parties: string[] = []) {
  return {
    model: 'gpt-5',
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
        model: 'gpt-5',
      };
    },
  } as unknown as AiService;
}

const job = <T>(data: T, attemptsMade = 0) =>
  ({ data, attemptsMade, opts: { attempts: 3 } }) as Job<T>;

describe('summary job (one per send) and invite job', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let documents: DocumentsService;
  let content: DocumentContentService;
  let usage: AiUsageService;
  let user: CurrentUser;
  let documentId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-summary-'));
    const storage = new StorageService({ STORAGE_DIR: dir } as Env);
    documents = new DocumentsService(db, storage);
    content = new DocumentContentService(
      db,
      new FakeDocProcessingService(),
      storage,
    );
    usage = new AiUsageService(db, env());
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
    // A text document keeps the summary job's input simple; the job does not
    // care how the send was made, so the row is inserted directly.
    const document = await documents.upload(user, {
      name: 'ijara.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode(CONTRACT),
    });
    documentId = document.id;
  });

  /** A sent send with `people` invite rows (and an open-link row). */
  async function sentRequest(
    options: { partyName?: string; people?: number } = {},
  ) {
    const [request] = await db
      .insert(signatureRequests)
      .values({
        documentId,
        createdByUserId: user.id,
        status: 'sent',
        sentAt: new Date(),
        title: 'ijara',
        documentHash: 'a'.repeat(64),
        partyName: options.partyName ?? null,
      })
      .returning();
    const count = options.people ?? 2;
    for (let i = 0; i < count; i++) {
      await db.insert(recipients).values({
        signatureRequestId: request.id,
        fullName: `Signer ${i}`,
        channel: 'email',
        contact: `signer${i}@example.com`,
        email: `signer${i}@example.com`,
        token: `invite-token-${request.id}-${i}`,
      });
    }
    await db.insert(recipients).values({
      signatureRequestId: request.id,
      fullName: 'Opened the link',
      channel: 'link',
      source: 'open_link',
      token: `open-token-${request.id}`,
    });
    return request;
  }

  function summarizer(parties: string[] = []) {
    return new SummarizeForRecipientsProcessor(
      db,
      stubAi(parties),
      content,
      usage,
    );
  }

  const summarize = (id: string) =>
    job<SummarizeForRecipientsJob>({ signatureRequestId: id, language: 'uz' });

  describe('summarize-for-recipients', () => {
    it('makes one model call and one row per send, and records its hash', async () => {
      const request = await sentRequest({
        partyName: 'Ijaraga oluvchi',
        people: 3,
      });
      const parties: string[] = [];
      await summarizer(parties).process(summarize(request.id));

      expect(parties).toEqual(['Ijaraga oluvchi']);
      const rows = await db
        .select()
        .from(recipientSummaries)
        .where(eq(recipientSummaries.signatureRequestId, request.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        recipientId: null,
        partyName: 'Ijaraga oluvchi',
        language: 'uz',
      });
      expect(rows[0].summaryHash).toBe(hashJson(rows[0].body));

      const [after] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, request.id));
      expect(after.summariesStatus).toBe('done');
      expect(after.summaryHash).toBe(rows[0].summaryHash);
    });

    it('is idempotent on re-delivery', async () => {
      const request = await sentRequest({ partyName: 'Xodim' });
      const parties: string[] = [];
      await summarizer(parties).process(summarize(request.id));
      await summarizer(parties).process(summarize(request.id));
      expect(parties).toHaveLength(1);
    });

    it('works for an open-link-only send (no invited people)', async () => {
      const request = await sentRequest({ partyName: 'Mijoz', people: 0 });
      await summarizer().process(summarize(request.id));
      const rows = await db
        .select()
        .from(recipientSummaries)
        .where(eq(recipientSummaries.signatureRequestId, request.id));
      expect(rows).toHaveLength(1);
    });

    it("falls back to the AI review's other party, then a generic signer", async () => {
      await db.insert(aiReviews).values({
        documentId,
        requestedByUserId: user.id,
        status: 'done',
        idempotencyKey: `review-${documentId}`,
        promptVersion: 'test',
        model: 'gpt-5',
        parties: [
          { name: 'Test Sender', role: 'landlord' },
          { name: 'Dilnoza Yusupova', role: 'tenant' },
        ],
      });
      const parties: string[] = [];
      const withReview = await sentRequest();
      await summarizer(parties).process(summarize(withReview.id));
      expect(parties).toEqual(['Dilnoza Yusupova']);

      await db.delete(aiReviews).where(eq(aiReviews.documentId, documentId));
      const generic = await sentRequest();
      await summarizer(parties).process(summarize(generic.id));
      expect(parties[1]).toBe('imzolovçi');
    });
  });

  describe('send-signing-invite', () => {
    function inviter() {
      const service = new SignatureRequestsService(
        db,
        env(),
        documents,
        {} as StorageService,
        noQueue,
        noQueue,
      );
      return new SendSigningInviteProcessor(db, service);
    }

    it('waits while the summary is still being written', async () => {
      const request = await sentRequest();
      let delayedUntil = 0;
      const inviteJob = {
        data: {
          signatureRequestId: request.id,
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
    });

    it('goes ahead once the deadline passes, and leaves the send as it is', async () => {
      const request = await sentRequest();
      await inviter().process(
        job<SendSigningInviteJob>({
          signatureRequestId: request.id,
          summaryDeadline: Date.now() - 1,
        }),
      );
      const [after] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, request.id));
      expect(after.status).toBe('sent');
      expect(after.sentAt?.getTime()).toBe(request.sentAt?.getTime());
    });

    it('does nothing for a cancelled send', async () => {
      const request = await sentRequest();
      await db
        .update(signatureRequests)
        .set({ status: 'cancelled', summariesStatus: 'queued' })
        .where(eq(signatureRequests.id, request.id));
      // Would wait (DelayedError) if it got past the status check.
      await expect(
        inviter().process(
          job<SendSigningInviteJob>({
            signatureRequestId: request.id,
            summaryDeadline: Date.now() + 60_000,
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
