import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewService } from '../src/ai-review/review.service.js';
import type { AiService } from '../src/ai-review/ai.service.js';
import { hashJson } from '../src/common/hash.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { recipientSummaries } from '../src/db/schema/index.js';
import { seedDemo, type DemoSeed } from '../src/dev/seed-demo.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { SigningService } from '../src/signing/signing.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb } from './helpers/test-db.js';

/**
 * The staging seed is what the frontend team develops against, so it has to
 * produce exactly the states the API would: a finished review read through the
 * real mappers, and a signing link the real signing route answers.
 */
describe('staging seed', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let seed: DemoSeed;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-seed-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    seed = await seedDemo(db, storage, { email: 'demo@lex.local' });
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  function reviews() {
    const queue = {
      add: async () => ({}) as never,
    } as never;
    return new ReviewService(
      db,
      new DocumentsService(db, storage),
      new AiUsageService(db, {
        AI_REVIEWS_LIMIT_PERSONAL: 20,
        AI_REVIEWS_LIMIT_AGENCY: 200,
      } as Env),
      { model: 'gpt-5', promptVersion: 'seed' } as AiService,
      queue,
      queue,
    );
  }

  const user = () => ({ id: seed.userId, agencyId: null, agencyRole: null });

  it('serves a finished review with one cited and one uncited issue', async () => {
    const wire = await reviews().getReview(user(), seed.reviewId);

    expect(wire.status).toBe('done');
    expect(wire.riskLevel).toBe('high');
    expect(wire.lawVersionDate).toBe('2026-06-01');
    expect(wire.issues).toHaveLength(2);
    expect(wire.issues[0].citation?.sourceUrl).toContain('lex.uz');
    expect(wire.issues[1].citation).toBeNull();
  });

  it('serves the parties for the send screen', async () => {
    const parties = await reviews().parties(user(), seed.documentId);
    expect(parties).toEqual([
      { name: 'Alisher Karimov', role: 'landlord' },
      { name: 'Dilnoza Yusupova', role: 'tenant' },
    ]);
  });

  it('serves a correction chat with a proposed edit', async () => {
    const messages = await reviews().listMessages(user(), seed.reviewId);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].edits).toHaveLength(1);
    expect(messages[1].edits[0].id).toBe(seed.editId);
    expect(messages[1].edits[0].status).toBe('proposed');
  });

  it('stores the document bytes the edit can be applied to', async () => {
    const wire = await reviews().listMessages(user(), seed.reviewId);
    const edit = wire[1].edits[0];
    const document = await new DocumentsService(db, storage).forUser(
      user(),
      seed.documentId,
    );
    const text = new TextDecoder().decode(
      await storage.get(document.storageKey),
    );
    expect(text.split(edit.original)).toHaveLength(2);
  });

  it('serves the signing summary for the printed link', async () => {
    const summary = await new SigningService(db).summaryForToken(
      seed.signToken,
    );
    expect(summary.partyName).toBe('Dilnoza Yusupova');
    expect(summary.yourObligations.length).toBeGreaterThan(0);
    expect(summary.keyConditions.length).toBeGreaterThan(0);
  });

  it('stores a summary hash that matches the stored summary', async () => {
    const [row] = await db
      .select()
      .from(recipientSummaries)
      .where(eq(recipientSummaries.recipientId, seed.recipientId));
    expect(row.summaryHash).toBe(hashJson(row.body));
  });
});
