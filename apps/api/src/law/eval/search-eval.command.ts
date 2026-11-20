/**
 * pnpm eval:search [--keyword-only] [--queries eval/search/queries.jsonl] [--out report.json]
 *
 * Runs the search quality eval against the database in DATABASE_URL (load
 * the law data first with `pnpm ingest:hf`, and `pnpm ingest:embed` for
 * hybrid). Hybrid (keyword + embeddings) when VOYAGE_API_KEY is set, unless
 * --keyword-only. Prints recall@5, recall@10, hit@10 and MRR, overall and per
 * topic, the queries that missed, and the time per query.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
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
  const keywordOnly = process.argv.includes('--keyword-only');
  const embeddings = keywordOnly ? new EmbeddingService(env, null) : new EmbeddingService(env);

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    const notEmbedded = await db.$count(schema.lawArticles, isNull(schema.lawArticles.embedding));
    const label = embeddings.enabled ? 'hybrid search (keyword + embeddings)' : 'keyword search';
    if (embeddings.enabled && notEmbedded > 0) {
      console.warn(`Warning: ${notEmbedded} rows have no embedding yet; run pnpm ingest:embed for a full hybrid measurement.`);
    }

    const search = new SearchService(db, embeddings);
    const times: number[] = [];
    const { summary, results } = await runSearchEval(queries, async (q) => {
      const t = performance.now();
      const hits = await search.search({ queries: [q.query], docType: q.docType, inForceOnly: true, limit: 30 });
      times.push(performance.now() - t);
      return hits.map((h) => h.articleId);
    });
    times.sort((a, b) => a - b);
    const timing = { p50: Math.round(times[Math.floor(times.length / 2)]), p95: Math.round(times[Math.floor(times.length * 0.95)]) };

    console.log(formatReport(label, summary, results));
    console.log(`\nTime per query: p50 ${timing.p50} ms, p95 ${timing.p95} ms (first queries include embedding calls).`);
    const out = arg('--out', '');
    if (out) {
      writeFileSync(out, JSON.stringify({ label, notEmbedded, timing, summary, results }, null, 2));
      writeFileSync(out.replace(/\.json$/, '') + '.txt', `${formatReport(label, summary, results)}\n\nTime per query: p50 ${timing.p50} ms, p95 ${timing.p95} ms\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
