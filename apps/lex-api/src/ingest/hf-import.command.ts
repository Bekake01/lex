/**
 * pnpm ingest:hf [path-to-articles.parquet]
 *
 * Imports the Hugging Face dataset sukhrobnurali/uzbek-legal-corpus
 * (articles config) into the database. Download the file first:
 *   https://huggingface.co/datasets/sukhrobnurali/uzbek-legal-corpus/resolve/main/articles/train-00000-of-00001.parquet
 *   → data/hf/articles.parquet (the default path)
 */
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { parseEnv } from '../config/env.js';
import * as schema from '../db/schema.js';
import { importHf, type HfImportReport } from './hf-import.js';

const DEFAULT_PATH = 'data/hf/articles.parquet';

function printReport(r: HfImportReport): void {
  const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(22)} ${String(value)}`);
  console.log('\nHF import finished');
  line('rows read', r.rows);
  line('skipped (too-short)', r.skipped['too-short']);
  line('skipped (empty text)', r.skipped['empty-text']);
  line('skipped (missing id)', r.skipped['missing-id']);
  line('renamed duplicate ids', r.renamedDuplicateIds);
  line('acts', `${r.acts.inserted} inserted, ${r.acts.updated} updated, ${r.acts.unchanged} unchanged`);
  line('articles', `${r.articles.inserted} inserted, ${r.articles.updated} updated, ${r.articles.unchanged} unchanged`);
  console.log('  acts by type');
  for (const [type, n] of Object.entries(r.actsByType).sort((a, b) => b[1] - a[1])) line(`  ${type}`, n);
  line('time', `${(r.ms / 1000).toFixed(1)} s`);
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const path = process.argv[2] ?? DEFAULT_PATH;
  if (!path.includes('*') && !existsSync(path)) {
    throw new Error(`Parquet file not found: ${path} (see the download link at the top of hf-import.command.ts)`);
  }

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const report = await importHf(drizzle(pool, { schema }), path, {
      onProgress: (n) => {
        if (n % 10_240 < 2048) console.log(`  … ${n} rows`);
      },
    });
    printReport(report);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
