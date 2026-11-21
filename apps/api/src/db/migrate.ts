import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Applies `drizzle/` migrations with the runtime dependencies only (no
 * drizzle-kit), so the deployed image can run it before the app starts:
 * `node dist/db/migrate.js`. Same journal table as `pnpm db:migrate`.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  });
  console.log('migrations applied');
} finally {
  await pool.end();
}
