/**
 * pnpm ingest:chunk
 *
 * Splits rows already in the database that are over the size limit.
 * `pnpm ingest:hf` already splits while importing; this is for rows loaded
 * before chunking existed or by other importers.
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';
import { chunkExisting, largestRowTokens } from './chunk-existing.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    const r = await chunkExisting(db);
    console.log(
      `Chunking finished: ${r.checked} large rows checked, ${r.split} split into ${r.parts} parts ` +
        `(${(r.ms / 1000).toFixed(1)} s). Largest row now: ~${await largestRowTokens(db)} tokens.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
