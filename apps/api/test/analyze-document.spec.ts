import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiService, StructuredCall } from '../src/ai-review/ai.service.js';
import { emptyUsage } from '../src/ai-review/ai.service.js';
import { DocumentContentService } from '../src/ai-review/document-content.service.js';
import { AnalyzeDocumentProcessor } from '../src/ai-review/jobs/analyze-document.processor.js';
import type { Db } from '../src/db/db.module.js';
import {
  aiIssues,
  aiReviews,
  aiUsage,
  documents,
} from '../src/db/schema/index.js';
import type { Env } from '../src/config/env.js';
import { FakeDocProcessingService } from '../src/law-search/fake-doc-processing.service.js';
import { FakeLawSearchService } from '../src/law-search/fake-law-search.service.js';
import type { AnalyzeDocumentJob } from '../src/queue/queue.constants.js';
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const CONTRACT = `1. Ijara haqi oyiga 5 000 000 so'm.
2. Ijaraga beruvchi ijara haqini istalgan vaqtda, ogohlantirmasdan oshirishi mumkin.
3. Shartnoma muddati bir yil.`;

/** Canned Claude answers: the pipeline is under test, not the model. */
function stubAi(
  calls: string[],
  options: { citeArticleId?: string | null } = {},
) {
  const citeArticleId =
    options.citeArticleId === undefined
      ? 'fx-civil-a556'
      : options.citeArticleId;

  return {
    model: 'claude-opus-5-5',
    promptVersion: 'test',
    defaultEffort: 'high' as const,
    configured: true,
    structured: async <T>(call: StructuredCall<T>) => {
      calls.push(call.label);
      const output =
        call.label === 'classify'
          ? {
              docType: 'rental',
              documentLanguage: 'uz-latn',
              parties: [
                { name: 'Alisher Karimov', role: 'landlord' },
                { name: 'Dilnoza Yusupova', role: 'tenant' },
              ],
              searchQueries: [
                'ijara haqini oshirish tartibi',
                'ijara shartnomasi',
              ],
            }
          : {
              riskLevel: 'high',
              verdict: 'needs_changes',
              summary: 'Bir tomonlama ijara haqini oshirish sharti xavfli.',
              issues: [
                {
                  clauseRef: '2',
                  quote: 'istalgan vaqtda, ogohlantirmasdan oshirishi mumkin',
                  problem:
                    'Ijara haqini cheklovsiz oshirish sharti nomutanosib.',
                  severity: 'high',
                  recommendation:
                    'Oshirish tartibi va ogohlantirish muddatini belgilang.',
                  articleId: citeArticleId,
                },
              ],
            };
      return {
        output: output as T,
        usage: {
          ...emptyUsage(),
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.01,
        },
        model: 'claude-opus-5-5',
      };
    },
  } as unknown as AiService;
}

function fakeJob(
  data: AnalyzeDocumentJob,
  attemptsMade = 0,
): Job<AnalyzeDocumentJob> {
  return {
    data,
    attemptsMade,
    opts: { attempts: 3 },
  } as Job<AnalyzeDocumentJob>;
}

describe('analyze-document job', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let usage: AiUsageService;
  let content: DocumentContentService;
  let user: Awaited<ReturnType<typeof seedUser>>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-analyze-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    usage = new AiUsageService(db, {
      AI_REVIEWS_LIMIT_PERSONAL: 20,
      AI_REVIEWS_LIMIT_AGENCY: 200,
    } as Env);
    content = new DocumentContentService(
      db,
      new FakeDocProcessingService(),
      storage,
    );
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
  });

  async function seedReview(text = CONTRACT) {
    const [document] = await db
      .insert(documents)
      .values({
        ownerUserId: user.id,
        agencyId: user.agencyId,
        name: 'ijara.txt',
        contentType: 'text/plain',
        sizeBytes: text.length,
        sha256: 'deadbeef',
        storageKey: 'pending',
      })
      .returning();

    const key = storage.buildKey(document.id, document.name);
    await storage.put(key, new TextEncoder().encode(text));
    await db
      .update(documents)
      .set({ storageKey: key, rootDocumentId: document.id })
      .where(eq(documents.id, document.id));

    const [review] = await db
      .insert(aiReviews)
      .values({
        documentId: document.id,
        requestedByUserId: user.id,
        agencyId: user.agencyId,
        language: 'uz',
        promptVersion: 'test',
        model: 'claude-opus-5-5',
        idempotencyKey: `${document.id}:deadbeef:test:uz`,
      })
      .returning();

    return { document, review };
  }

  function processor(ai: AiService) {
    return new AnalyzeDocumentProcessor(
      db,
      new FakeLawSearchService(),
      ai,
      content,
      usage,
    );
  }

  it('runs the pipeline and saves a grounded review', async () => {
    const { review } = await seedReview();
    const calls: string[] = [];
    await processor(stubAi(calls)).process(fakeJob({ reviewId: review.id }));

    expect(calls).toEqual(['classify', 'review']);

    const [saved] = await db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, review.id));
    expect(saved.status).toBe('done');
    expect(saved.riskLevel).toBe('high');
    expect(saved.verdict).toBe('needs_changes');
    expect(saved.docType).toBe('rental');
    expect(saved.parties).toHaveLength(2);
    expect(saved.lawVersionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved.inputTokens).toBe(2000);
    expect(Number(saved.costUsd)).toBeCloseTo(0.02, 6);

    const issues = await db
      .select()
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id));
    expect(issues).toHaveLength(1);
    expect(issues[0].citation?.articleId).toBe('fx-civil-a556');
    expect(issues[0].citation?.sourceUrl).toContain('lex.uz');
  });

  it('drops a citation the model invented', async () => {
    const { review } = await seedReview();
    await processor(stubAi([], { citeArticleId: 'fx-not-real-999' })).process(
      fakeJob({ reviewId: review.id }),
    );

    const issues = await db
      .select()
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id));
    expect(issues[0].citation).toBeNull();
    // The finding itself survives: "no supporting norm found" is a result.
    expect(issues[0].problem).toContain('nomutanosib');
  });

  it('is idempotent on re-delivery: the second run does nothing', async () => {
    const { review } = await seedReview();
    const calls: string[] = [];
    const worker = processor(stubAi(calls));

    await worker.process(fakeJob({ reviewId: review.id }));
    await worker.process(fakeJob({ reviewId: review.id }));

    expect(calls).toEqual(['classify', 'review']);

    const issues = await db
      .select()
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id));
    expect(issues).toHaveLength(1);

    const [metered] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.scopeKey, `user:${user.id}`));
    expect(metered.reviewsUsed).toBe(1);
  });

  it('replaces the previous attempt’s issues instead of adding to them', async () => {
    const { review } = await seedReview();
    await processor(stubAi([])).process(fakeJob({ reviewId: review.id }));

    // Force a second real run, as a retry after a partial failure would.
    await db
      .update(aiReviews)
      .set({ status: 'queued' })
      .where(eq(aiReviews.id, review.id));
    await processor(stubAi([])).process(fakeJob({ reviewId: review.id }));

    const issues = await db
      .select()
      .from(aiIssues)
      .where(eq(aiIssues.reviewId, review.id));
    expect(issues).toHaveLength(1);
  });

  it('marks the review failed with a safe message when the document cannot be read', async () => {
    const { document, review } = await seedReview();
    await db
      .update(documents)
      .set({ contentType: 'application/msword' })
      .where(eq(documents.id, document.id));

    await processor(stubAi([])).process(fakeJob({ reviewId: review.id }));

    const [saved] = await db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, review.id));
    expect(saved.status).toBe('failed');
    expect(saved.error).toMatch(/not built yet/);
    expect(saved.error).not.toContain('Ijara haqi');
  });

  it('does nothing when the review row is gone', async () => {
    await expect(
      processor(stubAi([])).process(
        fakeJob({ reviewId: '00000000-0000-7000-8000-000000000000' }),
      ),
    ).resolves.toBeUndefined();
  });
});
