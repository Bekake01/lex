/**
 * Creates the team's login accounts: `pnpm db:seed`.
 *
 * Hackathon only: each password is the email's part before "@"
 * (bekzodyangi1@gmail.com → bekzodyangi1). Never run it on a deployed
 * database. No email is sent.
 *
 * Safe to run again: existing emails are skipped (their passwords are not
 * reset). To add someone, add a line to TEAM and run it again.
 */
import { existsSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema/index.js';
import { users } from '../schema/index.js';

// All individuals (agency_id null) for now.
const TEAM: { email: string; fullName: string }[] = [
  { email: 'bekzodyangi1@gmail.com', fullName: 'Bekzod' },
  { email: 'emh01012006@gmail.com', fullName: 'Malika' },
  { email: 'zuhriddinjorakobilov@gmail.com', fullName: 'Zuxriddin' },
  { email: 'kamolovquvomiddin9@gmail.com', fullName: 'Quvomiddin' },
];

if (existsSync('.env')) process.loadEnvFile('.env');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema, casing: 'snake_case' });

try {
  for (const member of TEAM) {
    const email = member.email.trim().toLowerCase();
    const password = email.split('@')[0];
    const added = await db
      .insert(users)
      .values({
        email,
        fullName: member.fullName,
        passwordHash: await hash(password),
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    console.log(`${added.length > 0 ? 'added  ' : 'exists '} ${email}`);
  }
} finally {
  await pool.end();
}
