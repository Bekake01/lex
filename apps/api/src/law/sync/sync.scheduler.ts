import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pg from 'pg';
import { ENV, type Env } from '../../config/env.js';
import { DB, type Db } from '../../db/db.module.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { LexUzFetcher } from '../lexuz/fetcher.js';
import { LEXUZ_SYNC_LOCK, withAdvisoryLock } from './advisory-lock.js';
import { runLexUzSync, type SyncReport } from './sync.js';

/**
 * Runs the lex.uz sync every night at 03:00 Tashkent time, only when
 * SYNC_ENABLED=true, and only on the one instance that gets the advisory lock.
 */
@Injectable()
export class LexUzSyncScheduler {
  private readonly logger = new Logger(LexUzSyncScheduler.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Db,
    private readonly embeddings: EmbeddingService,
  ) {}

  @Cron('0 3 * * *', { name: 'lexuz-sync', timeZone: 'Asia/Tashkent' })
  async nightly(): Promise<void> {
    if (!this.env.SYNC_ENABLED) return;
    try {
      const report = await this.runLocked();
      if (report === null) this.logger.log('lex.uz sync: another instance is running it; skipped');
    } catch (error) {
      // Never let a sync failure take the API down; the run row records it.
      this.logger.error(`lex.uz sync crashed: ${(error as Error).message}`);
    }
  }

  /** One sync under the advisory lock; null when another instance holds it. */
  async runLocked(fetcher = new LexUzFetcher({ cacheDir: 'data/lexuz', refresh: true })): Promise<SyncReport | null> {
    // A dedicated connection: the lock belongs to the session that took it.
    const client = new pg.Client({ connectionString: this.env.DATABASE_URL });
    await client.connect();
    try {
      const report = await withAdvisoryLock(client, LEXUZ_SYNC_LOCK, () =>
        runLexUzSync(this.db, { fetcher, embeddings: this.embeddings }),
      );
      if (report) {
        this.logger.log(
          `lex.uz sync ${report.status}: ${report.checked} checked, ${report.updated} updated, ` +
            `${report.failed.length} failed, ${report.embedded} rows embedded, ${Math.round(report.ms / 1000)} s`,
        );
      }
      return report;
    } finally {
      await client.end();
    }
  }
}
