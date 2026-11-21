import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiService } from '../src/ai-review/ai.service.js';
import { ReviewService } from '../src/ai-review/review.service.js';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { aiReviews, aiUsage } from '../src/db/schema/index.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

function fakeQueue(): Queue & { added: { id?: string }[] } {
  const added: { id?: string }[] = [];
  return {
    added,
    add: async (_name: string, _data: unknown, opts?: { jobId?: string }) => {
      added.push({ id: opts?.jobId });
      return {} as never;
    },
  } as unknown as Queue & { added: { id?: string }[] };
}

const ai = {
  model: 'gpt-5',
  promptVersion: 'v1',
  configured: true,
} as unknown as AiService;

const noTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

describe('POST /documents/:id/reviews', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let documents: DocumentsService;
  let user: CurrentUser;
  let documentId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-review-api-'));
    documents = new DocumentsService(
      db,
      new StorageService({ STORAGE_DIR: dir } as Env),
    );
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
      bytes: new TextEncoder().encode('1. Ijara haqi.'),
    });
    documentId = document.id;
  });

  function service() {
    const analyze = fakeQueue();
    const revise = fakeQueue();
    const usage = new AiUsageService(db);
    return {
      analyze,
      revise,
      usage,
      reviews: new ReviewService(db, documents, usage, ai, analyze, revise),
    };
  }

  it('enqueues one job and returns the review id', async () => {
    const { reviews, analyze } = service();
    const { reviewId } = await reviews.createReview(user, documentId, 'uz');

    expect(analyze.added).toHaveLength(1);
    expect(analyze.added[0].id).toBe(`analyze.${reviewId}`);

    const wire = await reviews.getReview(user, reviewId);
    expect(wire.status).toBe('queued');
    expect(wire.language).toBe('uz');
    expect(wire.issues).toEqual([]);
  });

  it('returns the same review for the same document, prompt version and language', async () => {
    const { reviews, analyze } = service();
    const first = await reviews.createReview(user, documentId, 'uz');
    const second = await reviews.createReview(user, documentId, 'uz');

    expect(second.reviewId).toBe(first.reviewId);
    // The second POST did not enqueue a second analysis.
    expect(analyze.added).toHaveLength(1);
  });

  it('treats another language as its own review', async () => {
    const { reviews } = service();
    const uz = await reviews.createReview(user, documentId, 'uz');
    const ru = await reviews.createReview(user, documentId, 'ru');
    expect(ru.reviewId).not.toBe(uz.reviewId);
  });

  it('retries a failed review instead of stranding it', async () => {
    const { reviews, analyze } = service();
    const first = await reviews.createReview(user, documentId, 'uz');
    await db
      .update(aiReviews)
      .set({ status: 'failed', error: 'AI rate limit reached' })
      .where(eq(aiReviews.id, first.reviewId));

    const again = await reviews.createReview(user, documentId, 'uz');
    expect(again.reviewId).toBe(first.reviewId);
    expect(analyze.added).toHaveLength(2);

    const [row] = await db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.id, first.reviewId));
    expect(row.status).toBe('queued');
    expect(row.error).toBeNull();
  });

  it('refuses at enqueue when the 3 free checks are used up', async () => {
    const { reviews, usage } = service();
    for (let i = 0; i < 3; i++) {
      await usage.recordReview({ userId: user.id, agencyId: null }, noTokens);
    }

    await expect(reviews.createReview(user, documentId, 'uz')).rejects.toThrow(
      HttpException,
    );
    await expect(
      reviews.createReview(user, documentId, 'uz'),
    ).rejects.toMatchObject({ status: 402 });

    // Nothing was written for the refused request.
    const rows = await db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.documentId, documentId));
    expect(rows).toHaveLength(0);
  });

  it('pools an agency quota across its members', async () => {
    const owner = await seedUser(db, { agency: true });
    const colleague: CurrentUser = {
      id: (await seedUser(db)).id,
      agencyId: owner.agencyId,
      agencyRole: 'member',
    };

    const { usage } = service();
    await usage.recordReview(
      { userId: owner.id, agencyId: owner.agencyId },
      {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0.5,
      },
    );

    const seen = await usage.get(colleague);
    expect(seen.reviewsUsed).toBe(1);
    // No company plan bought yet: the free lifetime checks, pooled.
    expect(seen.reviewsLimit).toBe(3);

    const rows = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.scopeKey, `agency:${owner.agencyId}`));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.5, 6);
  });

  it('hides another sender’s document behind a 403', async () => {
    const { reviews } = service();
    const stranger = await seedUser(db);
    await expect(
      reviews.createReview(stranger, documentId, 'uz'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
