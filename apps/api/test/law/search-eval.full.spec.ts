import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { lawArticles } from '../../src/db/schema/index.js';
import { formatReport, parseQueries, runSearchEval } from '../../src/law/eval/search-eval.js';
import { importHf } from '../../src/law/ingest/hf-import.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { createTestDb } from '../helpers/test-db.js';

/**
 * Opt-in: the keyword-search baseline of the Phase 7 eval, without Postgres.
 *   HF_PARQUET=data/hf/articles.parquet EVAL_DB_DIR=data/eval-db pnpm vitest run test/law/search-eval.full.spec.ts
 *
 * Imports only codes, laws and the Constitution (about 12% of the corpus, all
 * the expected articles and the hardest distractors, e.g. the repealed 1995
 * Labour Code) into an on-disk PGlite at EVAL_DB_DIR, kept for later runs.
 * Writes the report to EVAL_REPORT (default data/eval-keyword.json).
 */
const FILE = process.env.HF_PARQUET;
const DB_DIR = process.env.EVAL_DB_DIR ?? 'data/eval-db';
const REPORT = process.env.EVAL_REPORT ?? 'data/eval-keyword.json';
const MINUTES = 60_000;

describe.runIf(FILE)('search eval: keyword baseline (codes + laws subset)', () => {
  it('scores the query set', async () => {
    mkdirSync(DB_DIR, { recursive: true });
    const { db, close } = await createTestDb(DB_DIR);
    try {
      if ((await db.$count(lawArticles)) === 0) {
        const subset = join(DB_DIR, '..', 'eval-subset.parquet');
        if (!existsSync(subset)) {
          const conn = await (await DuckDBInstance.create(':memory:')).connect();
          await conn.run(
            `COPY (SELECT * FROM read_parquet('${FILE!.replaceAll("'", "''")}')
                   WHERE doc_type IN ('code', 'law', 'constitution'))
             TO '${subset.replaceAll("'", "''")}' (FORMAT parquet)`,
          );
          conn.closeSync();
        }
        const t = Date.now();
        const report = await importHf(db, subset);
        writeFileSync(join(DB_DIR, '..', 'eval-import.json'), JSON.stringify({ ...report, ms: Date.now() - t }, null, 2));
      }

      const queries = parseQueries(readFileSync('eval/search/queries.jsonl', 'utf8'));
      const search = new SearchService(db);
      const times: number[] = [];
      const { summary, results } = await runSearchEval(queries, async (q) => {
        const t = performance.now();
        const hits = await search.search({ queries: [q.query], docType: q.docType, inForceOnly: true, limit: 30 });
        times.push(performance.now() - t);
        return hits.map((h) => h.articleId);
      });
      times.sort((a, b) => a - b);
      const timing = { p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)] };
      const text = formatReport('keyword search, codes + laws + constitution (PGlite)', summary, results);
      writeFileSync(REPORT, JSON.stringify({ label: 'keyword', corpus: 'code+law+constitution', timing, summary, results }, null, 2));
      writeFileSync(REPORT.replace(/\.json$/, '.txt'), `${text}\n\nPer-query time (PGlite): p50 ${timing.p50.toFixed(0)} ms, p95 ${timing.p95.toFixed(0)} ms\n`);

      expect(summary.queries).toBe(queries.length);
    } finally {
      await close();
    }
  }, 120 * MINUTES);
});
