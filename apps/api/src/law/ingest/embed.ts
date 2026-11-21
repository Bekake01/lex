import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../db/db.module.js';
import { lawActs, lawArticles } from '../../db/schema/index.js';
import { EmbeddingService, embeddingText } from '../embeddings/embedding.service.js';
import { countTokens } from '../text/index.js';

export interface EmbedReport {
  embedded: number;
  requests: number;
  /** Our token estimate (Voyage counts its own; Uzbek usually comes out higher). */
  estimatedTokens: number;
  ms: number;
}

export interface EmbedOptions {
  /**
   * Token budget per provider request, by our estimate. Voyage accepts up to
   * 320k tokens per request; Uzbek can tokenize ~1.5x our estimate, so stay well under.
   */
  tokensPerRequest?: number;
  /** Rows read from the database per round. */
  pageSize?: number;
  /** Stop after this many rows (for trial runs). */
  limit?: number;
  onProgress?: (done: number, report: EmbedReport) => void;
}

/**
 * Embeds every law row that has no embedding yet. Resumable: rows
 * are saved batch by batch, and a re-run picks up the rows still NULL, so an
 * interrupted run loses at most one batch and never pays twice.
 * Re-imports clear the embedding of rows whose text changed.
 */
export async function embedMissing(db: Db, embeddings: EmbeddingService, options: EmbedOptions = {}): Promise<EmbedReport> {
  const { tokensPerRequest = 100_000, pageSize = 500, limit = Infinity, onProgress } = options;
  const started = Date.now();
  const report: EmbedReport = { embedded: 0, requests: 0, estimatedTokens: 0, ms: 0 };
  const maxBatch = embeddings.provider?.maxBatch ?? 128;
  let after = '';

  while (report.embedded < limit) {
    const rows = await db
      .select({ id: lawArticles.id, act: lawActs.title, title: lawArticles.title, text: lawArticles.text })
      .from(lawArticles)
      .innerJoin(lawActs, eq(lawActs.docId, lawArticles.docId))
      .where(and(isNull(lawArticles.embedding), gt(lawArticles.id, after)))
      .orderBy(asc(lawArticles.id))
      .limit(Math.min(pageSize, limit - report.embedded));
    if (rows.length === 0) break;
    after = rows[rows.length - 1].id;

    // Pack rows into requests by token budget and the provider's batch size.
    let batch: { id: string; text: string }[] = [];
    let batchTokens = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      const vectors = await embeddings.embedDocuments(batch.map((b) => b.text));
      await db.transaction(async (tx) => {
        for (let i = 0; i < batch.length; i++) {
          await tx.update(lawArticles).set({ embedding: vectors[i] }).where(eq(lawArticles.id, batch[i].id));
        }
      });
      report.requests++;
      report.embedded += batch.length;
      report.estimatedTokens += batchTokens;
      report.ms = Date.now() - started;
      onProgress?.(report.embedded, report);
      batch = [];
      batchTokens = 0;
    };

    for (const row of rows) {
      const text = embeddingText(row.act, row.title, row.text);
      const tokens = countTokens(text);
      if (batch.length > 0 && (batchTokens + tokens > tokensPerRequest || batch.length >= maxBatch)) await flush();
      batch.push({ id: row.id, text });
      batchTokens += tokens;
    }
    await flush();
  }

  report.ms = Date.now() - started;
  return report;
}

/** How many rows still need an embedding. */
export async function countMissing(db: Db): Promise<number> {
  return db.$count(lawArticles, isNull(lawArticles.embedding));
}
