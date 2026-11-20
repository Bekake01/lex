/**
 * pnpm ingest:core [--only -2460801,-180552] [--refresh] [--delay 20000]
 *
 * Imports the core acts (src/law/lexuz/core-acts.ts) from lex.uz in their
 * current edition. One request every 20 s (lex.uz's published crawl delay),
 * so ~16 acts take ~6 minutes the first time; pages are cached in
 * data/lexuz/ and re-runs send no requests unless --refresh.
 * Afterwards run `pnpm ingest:embed` for the new or changed rows.
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { CORE_ACTS } from './core-acts.js';
import { LexUzFetcher } from './fetcher.js';
import { importCoreActs } from './ingest-core.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const only = arg('--only')?.split(',').map((s) => s.trim());
  const acts = only ? CORE_ACTS.filter((a) => only.includes(a.docId)) : CORE_ACTS;
  if (acts.length === 0) throw new Error(`No core act matches --only ${only?.join(',')}`);
  const delayMs = Number(arg('--delay') ?? 20_000);

  const fetcher = new LexUzFetcher({ cacheDir: 'data/lexuz', refresh: process.argv.includes('--refresh'), delayMs });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    console.log(`Importing ${acts.length} core acts from lex.uz (one request every ${delayMs / 1000} s; cached pages are free).`);
    const results = await importCoreActs(drizzle(pool, { schema, casing: 'snake_case' }), fetcher, acts, (r) => {
      const detail =
        r.outcome === 'failed'
          ? `FAILED: ${r.error}`
          : `${r.status}, edition ${r.versionDate ?? '?'}, ${r.articles} articles → ${r.rows} rows, ${r.keptEmbeddings ?? 0} embeddings kept`;
      console.log(`  ${r.outcome.padEnd(9)} ${r.docId.padEnd(9)} ${r.name.slice(0, 45).padEnd(45)} ${detail}`);
    });
    const failed = results.filter((r) => r.outcome === 'failed').length;
    console.log(`Done: ${results.length - failed} ok, ${failed} failed, ${fetcher.requests} requests to lex.uz. Next: pnpm ingest:embed`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
