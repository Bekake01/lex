import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lawArticles } from '../src/db/schema.js';
import { importHf } from '../src/ingest/hf-import.js';
import { SearchService } from '../src/search/search.service.js';
import { createTestDb } from './helpers/test-db.js';

/**
 * Opt-in: search quality on the real dataset (imports it into an on-disk PGlite first).
 *   HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/search.full.spec.ts
 * Takes several minutes; skipped in the normal test run.
 */
const FILE = process.env.HF_PARQUET;
const MINUTES = 60_000;

/** Civil Code Part 2 (doc -180552), chapter on property rental: articles 535–557. */
const RENTAL = new Set(Array.from({ length: 23 }, (_, i) => `-180552-a${535 + i}`));

describe.runIf(FILE)('keyword search on the full dataset', () => {
  let search: SearchService;
  let close: () => Promise<void>;
  let dir: string;

  beforeAll(async () => {
    // SEARCH_DB_DIR keeps the imported database between runs (for tuning).
    dir = process.env.SEARCH_DB_DIR ?? mkdtempSync(join(tmpdir(), 'lex-search-full-'));
    const t = await createTestDb(dir);
    close = t.close;
    if ((await t.db.$count(lawArticles)) === 0) await importHf(t.db, FILE!);
    search = new SearchService(t.db);
  }, 60 * MINUTES);

  afterAll(async () => {
    await close();
    if (!process.env.SEARCH_DB_DIR) rmSync(dir, { recursive: true, force: true });
  });

  const run = (queries: string[]) => search.search({ queries, inForceOnly: true, limit: 10 });

  it('finds Civil Code rental articles for a rental termination query', async () => {
    const hits = await run(['ijara shartnomasini bekor qilish']);
    console.log(hits.map((h) => `${h.articleId}  ${h.actTitle.slice(0, 40)}  ${h.text.slice(0, 50)}`).join('\n'));
    expect(hits.some((h) => RENTAL.has(h.articleId))).toBe(true);
  }, 5 * MINUTES);

  it('times five queries together', async () => {
    const queries = [
      'ijara shartnomasini bekor qilish',
      'ijara haqi toʻlash muddati',
      'ijaraga beruvchining majburiyatlari',
      'mol-mulkni qaytarish',
      'shartnomani muddatidan oldin bekor qilish',
    ];
    await run(queries); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await run(queries);
      times.push(performance.now() - t);
    }
    console.log(`5-query search: ${times.map((t) => t.toFixed(0)).join(', ')} ms`);
    expect(times.length).toBe(5);
  }, 5 * MINUTES);
});
