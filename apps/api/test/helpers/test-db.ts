import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from '../../src/db/db.module.js';
import * as schema from '../../src/db/schema/index.js';

/**
 * An in-process Postgres (PGlite + pgvector) with the real migrations
 * applied, so tests exercise the same SQL as `pnpm db:migrate`.
 */
export async function createTestDb(
  dataDir?: string,
): Promise<{ db: Db; close: () => Promise<void> }> {
  // In memory by default; pass a folder for data too large for memory.
  const client = new PGlite({ dataDir, extensions: { vector } });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });
  return { db: db as unknown as Db, close: () => client.close() };
}
