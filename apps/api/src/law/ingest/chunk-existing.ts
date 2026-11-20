import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/db.module.js';
import { lawArticles, type NewLawArticle } from '../../db/schema/index.js';
import { CHUNK_LIMITS, chunkArticle } from './chunk.js';

export interface ChunkExistingReport {
  /** Whole rows big enough to be candidates. */
  checked: number;
  /** Rows replaced by parts, and how many parts were written. */
  split: number;
  parts: number;
  ms: number;
}

/**
 * Splits whole rows already in the database that are over the size limit
 * (rows loaded before chunking existed, or by other importers). Each one is
 * replaced by its parts in one transaction. Safe to re-run.
 */
export async function chunkExisting(
  db: Db,
  { batchSize = 200 }: { batchSize?: number } = {},
): Promise<ChunkExistingReport> {
  const started = Date.now();
  const report: ChunkExistingReport = { checked: 0, split: 0, parts: 0, ms: 0 };
  // The smaller of the two thresholds; chunkArticle applies the right one.
  const threshold = Math.min(CHUNK_LIMITS.flatSplitAt, CHUNK_LIMITS.articleSplitAt);
  let after = '';

  for (;;) {
    const rows = await db
      .select()
      .from(lawArticles)
      .where(
        and(
          gt(lawArticles.id, after),
          isNull(lawArticles.parentId),
          eq(lawArticles.chunkIndex, 0),
          or(isNull(lawArticles.nTokens), gt(lawArticles.nTokens, threshold)),
        ),
      )
      .orderBy(asc(lawArticles.id))
      .limit(batchSize);
    if (rows.length === 0) break;
    after = rows[rows.length - 1].id;

    for (const { tsv: _generated, ...row } of rows) {
      report.checked++;
      const parts: NewLawArticle[] = chunkArticle(row);
      if (parts.length === 1) continue;

      await db.transaction(async (tx) => {
        await tx.insert(lawArticles).values(parts).onConflictDoNothing();
        await tx.delete(lawArticles).where(eq(lawArticles.id, row.id));
      });
      report.split++;
      report.parts += parts.length;
    }
  }

  report.ms = Date.now() - started;
  return report;
}

/** The largest stored row, for checking the size limit holds. */
export async function largestRowTokens(db: Db): Promise<number> {
  const [row] = await db.select({ max: sql<number>`max(${lawArticles.nTokens})` }).from(lawArticles);
  return Number(row?.max ?? 0);
}
