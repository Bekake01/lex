import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
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
 * Prints the ids the frontend needs, the demo login (password = the email's
 * part before "@", like `pnpm db:seed`), and the signing link for `apps/sign`.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const env = parseEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

try {
  const email = (process.argv[2] ?? 'demo@lex.local').toLowerCase();
  const seed = await seedDemo(db, new StorageService(env), { email });
  const password = email.split('@')[0];
  await db
    .update(schema.users)
    .set({ passwordHash: await hash(password) })
    .where(eq(schema.users.id, seed.userId));

  console.log('Seeded a demo sender with a finished review.\n');
  console.log(`  login:                ${email} / ${password}`);
  console.log(`  userId:               ${seed.userId}`);
  console.log(`  documentId:           ${seed.documentId}`);
  console.log(`  reviewId:             ${seed.reviewId}`);
  console.log(`  proposed editId:      ${seed.editId}`);
  console.log(`  signatureRequestId:   ${seed.signatureRequestId}`);
  console.log(
    `  signing link:         ${env.SIGN_APP_URL}/sign/${seed.signToken}\n`,
  );
  console.log('Try it (TOKEN = accessToken from POST /auth/login):');
  console.log(
    `  curl -H "Authorization: Bearer $TOKEN" http://localhost:${env.PORT}/reviews/${seed.reviewId}`,
  );
  console.log(
    `  curl -H "Authorization: Bearer $TOKEN" http://localhost:${env.PORT}/documents/${seed.documentId}/parties`,
  );
  console.log(
    `  curl http://localhost:${env.PORT}/sign/${seed.signToken}/summary`,
  );
} finally {
  await pool.end();
}
