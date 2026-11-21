/**
 * pnpm sync:lexuz
 *
 * Runs the lex.uz sync once, now (the same run the nightly job does when
 * SYNC_ENABLED=true): re-checks the 16 core acts on lex.uz (one request every
 * 20 s, about 6 minutes), updates the changed ones, embeds their new rows if
 * VOYAGE_API_KEY is set, and records a law_sync_runs row. Safe to run any time;
 * it waits for nobody and skips if another sync holds the lock.
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { LexUzFetcher } from '../lexuz/fetcher.js';
import { LEXUZ_SYNC_LOCK, withAdvisoryLock } from './advisory-lock.js';
import { runLexUzSync } from './sync.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });
  const lockClient = new pg.Client({ connectionString: env.DATABASE_URL });
  await lockClient.connect();
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    const embeddings = new EmbeddingService(env);
    console.log(`Syncing core acts from lex.uz (one request every 20 s)${embeddings.enabled ? ', then embedding changed rows' : ''}…`);
    const report = await withAdvisoryLock(lockClient, LEXUZ_SYNC_LOCK, () =>
      runLexUzSync(db, { fetcher: new LexUzFetcher({ cacheDir: 'data/lexuz', refresh: true }), embeddings }),
    );
    if (!report) {
      console.log('Another sync is running (lock held); nothing done.');
      return;
    }
    console.log(
      `Sync ${report.status}: ${report.checked} checked, ${report.updated} updated, ${report.unchanged} unchanged, ` +
        `${report.failed.length} failed, ${report.embedded} rows embedded, ${Math.round(report.ms / 1000)} s (run #${report.runId}).`,
    );
    for (const f of report.failed) console.log(`  failed ${f.docId}: ${f.error}`);
    if (report.status === 'failed') process.exitCode = 1;
  } finally {
    await lockClient.end();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
