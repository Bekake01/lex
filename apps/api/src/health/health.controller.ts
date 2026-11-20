import { Controller, Get, Inject } from '@nestjs/common';
import { max, sql } from 'drizzle-orm';
import type { HealthResponse } from '../law/law.types.js';
import { DB, type Db } from '../db/db.module.js';
import { lawActs } from '../db/schema/index.js';
import { Public } from '../auth/auth.decorators.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Always 200 while the process is up. `db: false` means Postgres is
   * unreachable; `indexVersionDate` is the newest law edition loaded, or
   * null when the index is empty or the db is down.
   */
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      return { ok: true, db: false, indexVersionDate: null };
    }
    const [row] = await this.db.select({ latest: max(lawActs.versionDate) }).from(lawActs);
    return { ok: true, db: true, indexVersionDate: row?.latest ?? null };
  }
}
