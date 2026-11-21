import { eq } from 'drizzle-orm';
import type { Db } from '../../db/db.module.js';
import { lawSyncRuns } from '../../db/schema/index.js';
import type { EmbeddingService } from '../embeddings/embedding.service.js';
import { embedMissing } from '../ingest/embed.js';
import { CORE_ACTS, type CoreAct } from '../lexuz/core-acts.js';
import type { LexUzFetcher } from '../lexuz/fetcher.js';
import { importCoreActs, type CoreActResult } from '../lexuz/ingest-core.js';

export interface SyncReport {
  runId: number;
  status: 'ok' | 'failed';
  checked: number;
  updated: number;
  unchanged: number;
  failed: { docId: string; error: string }[];
  /** Rows embedded after the update (0 when embeddings are off). */
  embedded: number;
  ms: number;
}

/**
 * The daily lex.uz sync. Re-checks every core act on
 * lex.uz and replaces those whose edition, status or text changed (same
 * import as ingest-core: one transaction per act, so a failed or broken page leaves the old
 * version intact; unchanged rows keep their embeddings). Then embeds the
 * changed rows when embeddings are configured.
 *
 * With 16 core acts a full re-check is 16 polite requests a night; it also
 * catches acts that become repealed, which an amendments feed would not.
 *
 * One `law_sync_runs` row per run: `ok` when at least one act was checked
 * (failed acts are listed in `error` and retried the next night), `failed`
 * when none could be, or lex.uz stopped answering.
 */
export async function runLexUzSync(
  db: Db,
  deps: { fetcher: LexUzFetcher; embeddings?: EmbeddingService | null; acts?: CoreAct[] },
): Promise<SyncReport> {
  const started = Date.now();
  const acts = deps.acts ?? CORE_ACTS;
  const [run] = await db.insert(lawSyncRuns).values({ status: 'running' }).returning({ id: lawSyncRuns.id });

  let results: CoreActResult[] = [];
  let stopped: string | null = null;
  try {
    results = await importCoreActs(db, deps.fetcher, acts);
  } catch (error) {
    // The fetcher stops the run when lex.uz keeps failing; acts already done stay done.
    stopped = (error as Error).message;
  }

  const failed = results.filter((r) => r.outcome === 'failed').map((r) => ({ docId: r.docId, error: r.error ?? 'unknown' }));
  const updated = results.filter((r) => r.outcome === 'inserted' || r.outcome === 'updated').length;
  const checked = results.length - failed.length;

  let embedded = 0;
  const notes: string[] = [];
  if (updated > 0 && deps.embeddings?.enabled) {
    try {
      embedded = (await embedMissing(db, deps.embeddings)).embedded;
    } catch (error) {
      // The new text is saved; its rows just stay unembedded until the next run or `pnpm ingest:embed`.
      notes.push(`embedding failed: ${(error as Error).message}`);
    }
  }

  const status: SyncReport['status'] = stopped || checked === 0 ? 'failed' : 'ok';
  if (stopped) notes.push(stopped);
  if (failed.length > 0) notes.push(`failed acts: ${failed.map((f) => `${f.docId} (${f.error})`).join('; ')}`);

  await db
    .update(lawSyncRuns)
    .set({
      finishedAt: new Date(),
      status,
      actsChecked: checked,
      actsUpdated: updated,
      error: notes.length > 0 ? notes.join(' | ').slice(0, 2000) : null,
    })
    .where(eq(lawSyncRuns.id, run.id));

  return {
    runId: run.id,
    status,
    checked,
    updated,
    unchanged: results.filter((r) => r.outcome === 'unchanged').length,
    failed,
    embedded,
    ms: Date.now() - started,
  };
}
