/**
 * pnpm eval:search [--queries eval/search/queries.jsonl] [--out report.json]
 *
 * Runs the search quality eval against the database in DATABASE_URL (load
 * the law data first with `pnpm ingest:hf`). Prints recall@5, recall@10,
 * hit@10 and MRR, overall and per topic, plus the queries that missed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { SearchService } from '../search/search.service.js';
import { formatReport, parseQueries, runSearchEval } from './search-eval.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const queries = parseQueries(readFileSync(arg('--queries', 'eval/search/queries.jsonl'), 'utf8'));

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const search = new SearchService(drizzle(pool, { schema, casing: 'snake_case' }));
    const { summary, results } = await runSearchEval(queries, async (q) =>
      (await search.search({ queries: [q.query], docType: q.docType, inForceOnly: true, limit: 30 })).map(
        (h) => h.articleId,
      ),
    );
    console.log(formatReport('keyword search', summary, results));
    const out = arg('--out', '');
    if (out) writeFileSync(out, JSON.stringify({ label: 'keyword', summary, results }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
