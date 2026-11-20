import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Db } from '../src/db/db.module.js';
import { lawActs, lawArticles } from '../src/db/schema.js';
import { importHf, type HfImportReport } from '../src/ingest/hf-import.js';
import { createTestDb } from './helpers/test-db.js';

/**
 * Opt-in: imports the real dataset file into an on-disk PGlite, twice.
 *   HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/hf-import.full.spec.ts
 * Takes several minutes; skipped in the normal test run.
 */
const FILE = process.env.HF_PARQUET;
const MINUTES = 60_000;

describe.runIf(FILE)('importHf on the full dataset', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let first: HfImportReport;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lex-hf-full-'));
    ({ db, close } = await createTestDb(dir));
  }, MINUTES);

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('imports every usable row', async () => {
    first = await importHf(db, FILE!, {
      onProgress: (n) => n % 10_240 < 2048 && console.log(`  … ${n} rows`),
    });
    console.log(JSON.stringify(first, null, 2));

    // Dataset card: 24,267 acts / 54,173 article rows, 11 flagged too-short.
    expect(first.rows).toBe(54_173);
    expect(first.skipped['too-short']).toBe(11);
    expect(first.articles.inserted).toBe(54_173 - 11);
    expect(await db.$count(lawArticles)).toBe(54_173 - 11);
    expect(await db.$count(lawActs)).toBe(first.acts.inserted);
    expect(first.acts.inserted).toBeGreaterThanOrEqual(24_260);
  }, 60 * MINUTES);

  it('finds Civil Code rental articles by keyword', async () => {
    const rows = await db
      .select({ title: lawArticles.title })
      .from(lawArticles)
      .where(sql`${lawArticles.tsv} @@ plainto_tsquery('simple', 'mulk ijarasi shartnomasi')`)
      .limit(5);
    console.log(rows);
    expect(rows.length).toBeGreaterThan(0);
  }, MINUTES);

  it('a second run inserts and updates nothing', async () => {
    const second = await importHf(db, FILE!);
    expect(second.articles).toEqual({ inserted: 0, updated: 0, unchanged: first.articles.inserted });
    expect(second.acts).toEqual({ inserted: 0, updated: 0, unchanged: first.acts.inserted });
  }, 60 * MINUTES);
});
