/**
 * pnpm ingest:embed [--limit N]
 *
 * Embeds every law row without an embedding, with the configured provider
 * (Voyage: VOYAGE_API_KEY in .env). Resumable: stop it any time and run it
 * again. The full corpus is ~190k rows / ~120M estimated tokens (about $7
 * with voyage-3.5); use --limit for a trial run first.
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { countMissing, embedMissing } from './embed.js';

function limitArg(): number {
  const i = process.argv.indexOf('--limit');
  const n = i > 0 ? Number(process.argv[i + 1]) : Infinity;
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const embeddings = new EmbeddingService(env);
  if (!embeddings.enabled) {
    throw new Error('Embeddings are not configured: set VOYAGE_API_KEY in apps/api/.env (EMBEDDING_PROVIDER=voyage)');
  }

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    const missing = await countMissing(db);
    const limit = limitArg();
    console.log(`${missing} rows need an embedding${Number.isFinite(limit) ? `; embedding at most ${limit}` : ''}.`);

    let lastLog = 0;
    const report = await embedMissing(db, embeddings, {
      limit,
      onProgress: (done, r) => {
        if (done - lastLog < 2000 && done !== missing) return;
        lastLog = done;
        const rate = done / Math.max(1, r.ms / 1000);
        const left = Math.min(limit, missing) - done;
        console.log(`  ${done} done, ~${Math.round(r.estimatedTokens / 1e6)}M tokens, ${rate.toFixed(0)} rows/s, ~${Math.round(left / Math.max(rate, 1) / 60)} min left`);
      },
    });
    console.log(
      `Embedded ${report.embedded} rows in ${report.requests} requests, ~${(report.estimatedTokens / 1e6).toFixed(1)}M estimated tokens, ${(report.ms / 60000).toFixed(1)} min. ` +
        `${await countMissing(db)} rows still without an embedding.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
