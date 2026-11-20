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

/** A sender: an individual user, or a member of a fresh agency. */
export async function seedUser(
  db: Db,
  options: { agency?: boolean; email?: string } = {},
): Promise<{
  id: string;
  agencyId: string | null;
  agencyRole: null | 'owner';
}> {
  let agencyId: string | null = null;
  if (options.agency) {
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: 'Test agency' })
      .returning({ id: schema.agencies.id });
    agencyId = agency.id;
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      email:
        options.email ??
        `sender-${Date.now()}-${Math.random()}@example.com`.toLowerCase(),
      fullName: 'Test Sender',
      agencyId,
      agencyRole: agencyId ? 'owner' : null,
    })
    .returning({ id: schema.users.id });

  return {
    id: user.id,
    agencyId,
    agencyRole: agencyId ? 'owner' : null,
  };
}
