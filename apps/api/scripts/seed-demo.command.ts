import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseEnv } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import * as schema from '../src/db/schema/index.js';
import { seedDemo } from '../src/dev/seed-demo.js';
import { StorageService } from '../src/storage/storage.service.js';

/**
 * Staging seed for the frontend team.
 *
 *   cd apps/api && pnpm seed:demo [email]
 *
 * Prints the ids the frontend needs, including the `x-user-id` to send while
 * login is still being built, and the signing link for `apps/sign`.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const env = parseEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

try {
  const seed = await seedDemo(db, new StorageService(env), {
    email: process.argv[2],
  });

  console.log('Seeded a demo sender with a finished review.\n');
  console.log(`  x-user-id:            ${seed.userId}`);
  console.log(`  documentId:           ${seed.documentId}`);
  console.log(`  reviewId:             ${seed.reviewId}`);
  console.log(`  proposed editId:      ${seed.editId}`);
  console.log(`  signatureRequestId:   ${seed.signatureRequestId}`);
  console.log(
    `  signing link:         ${env.SIGN_APP_URL}/sign/${seed.signToken}\n`,
  );
  console.log('Try it:');
  console.log(
    `  curl -H "x-user-id: ${seed.userId}" http://localhost:${env.PORT}/reviews/${seed.reviewId}`,
  );
  console.log(
    `  curl -H "x-user-id: ${seed.userId}" http://localhost:${env.PORT}/documents/${seed.documentId}/parties`,
  );
  console.log(
    `  curl http://localhost:${env.PORT}/sign/${seed.signToken}/summary`,
  );
} finally {
  await pool.end();
}
