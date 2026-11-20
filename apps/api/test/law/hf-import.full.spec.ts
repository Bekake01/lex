import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { lawActs, lawArticles } from '../../src/db/schema/index.js';
import { CHUNK_LIMITS } from '../../src/law/ingest/chunk.js';
import { largestRowTokens } from '../../src/law/ingest/chunk-existing.js';
import { importHf, type HfImportReport } from '../../src/law/ingest/hf-import.js';
import { normalizeUz } from '../../src/law/text/index.js';
import { createTestDb } from '../helpers/test-db.js';

/**
 * Opt-in: imports the real dataset file into an on-disk PGlite, twice.
 *   HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/law/hf-import.full.spec.ts
 * Takes several minutes; skipped in the normal test run. Writes the import
 * report to HF_REPORT (default: <tmp>/hf-import-report.json).
 */
const FILE = process.env.HF_PARQUET;
const REPORT = process.env.HF_REPORT ?? join(tmpdir(), 'hf-import-report.json');
const MINUTES = 60_000;
const squash = (s: string) => s.replace(/\s+/g, '');

describe.runIf(FILE)('importHf on the full dataset', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let first: HfImportReport;
  let stored: number;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lex-hf-full-'));
    ({ db, close } = await createTestDb(dir));
  }, MINUTES);

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('imports every usable row', async () => {
    first = await importHf(db, FILE!);
    stored = await db.$count(lawArticles);
    writeFileSync(REPORT, JSON.stringify({ ...first, stored, largest: await largestRowTokens(db) }, null, 2));

    // Dataset card: 24,267 acts / 54,173 article rows, 11 flagged too-short.
    expect(first.rows).toBe(54_173);
    expect(first.skipped['too-short']).toBe(11);
    const whole = 54_173 - 11 - first.split.articles;
    expect(stored).toBe(whole + first.split.parts);
    expect(first.articles.inserted).toBe(stored);
    expect(await db.$count(lawActs)).toBe(24_267);
  }, 60 * MINUTES);

  it(`stores no row over ${CHUNK_LIMITS.hardMax} tokens`, async () => {
    expect(await largestRowTokens(db)).toBeLessThanOrEqual(CHUNK_LIMITS.hardMax);
  }, MINUTES);

  it('split articles join back into their original text', async () => {
    // The 3 longest originals, from the source file.
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();
    const originals = (
      await conn.runAndReadAll(
        `SELECT id, article_text FROM read_parquet('${FILE!.replaceAll("'", "''")}')
         ORDER BY length(article_text) DESC LIMIT 3`,
      )
    ).getRowObjectsJson() as { id: string; article_text: string }[];
    conn.closeSync();
    instance.closeSync();

    for (const o of originals) {
      const parts = await db
        .select({ text: lawArticles.text })
        .from(lawArticles)
        .where(eq(lawArticles.parentId, o.id))
        .orderBy(asc(lawArticles.chunkIndex));
      expect(parts.length).toBeGreaterThan(1);
      expect(squash(parts.map((p) => p.text).join(' '))).toBe(squash(normalizeUz(o.article_text)));
    }
  }, 10 * MINUTES);

  it('finds Civil Code rental articles by keyword', async () => {
    const rows = await db
      .select({ title: lawArticles.title })
      .from(lawArticles)
      .where(sql`${lawArticles.tsv} @@ plainto_tsquery('simple', 'mulk ijarasi shartnomasi')`)
      .limit(5);
    expect(rows.length).toBeGreaterThan(0);
    expect(await db.$count(lawArticles, isNotNull(lawArticles.parentId))).toBe(first.split.parts);
  }, MINUTES);

  it('a second run inserts, updates and removes nothing', async () => {
    const second = await importHf(db, FILE!);
    expect(second.articles).toEqual({ inserted: 0, updated: 0, unchanged: stored, removed: 0 });
    expect(second.acts).toEqual({ inserted: 0, updated: 0, unchanged: first.acts.inserted });
  }, 60 * MINUTES);
});
