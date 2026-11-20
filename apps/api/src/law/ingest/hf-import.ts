import { DuckDBInstance } from '@duckdb/node-api';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/db.module.js';
import { lawActs, lawArticles, type NewLawAct, type NewLawArticle } from '../../db/schema/index.js';
import { chunkArticle } from './chunk.js';
import { HF_COLUMNS, mapRow, uniqueId, type HfRow, type SkipReason } from './hf-rows.js';

export interface UpsertCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface HfImportReport {
  rows: number;
  skipped: Record<SkipReason, number>;
  /** Rows whose dataset id was already used and got a `-dN` suffix. */
  renamedDuplicateIds: number;
  /** Dataset rows too long for one row, and the parts they became. */
  split: { articles: number; parts: number };
  acts: UpsertCounts;
  actsByType: Record<string, number>;
  /** Stored rows (whole articles and parts). `removed` = leftovers deleted. */
  articles: UpsertCounts & { removed: number };
  ms: number;
}

/** Rows per INSERT: 15 columns × 2,000 stays well under Postgres's 65,535 parameters. */
const INSERT_SLICE = 2000;

export interface HfImportOptions {
  batchSize?: number;
  onProgress?: (rowsRead: number) => void;
}

/** `excluded.<col>` for every column an upsert may overwrite. */
const excluded = (column: string): SQL => sql.raw(`excluded.${column}`);

/**
 * Imports the dataset's articles Parquet into law_acts + law_articles.
 * Idempotent: unchanged rows are not written, so a second run of the same
 * file reports 0 inserted and 0 updated.
 */
export async function importHf(
  db: Db,
  parquetPath: string,
  { batchSize = 1000, onProgress }: HfImportOptions = {},
): Promise<HfImportReport> {
  const started = Date.now();
  const report: HfImportReport = {
    rows: 0,
    skipped: { 'too-short': 0, 'empty-text': 0, 'missing-id': 0 },
    renamedDuplicateIds: 0,
    split: { articles: 0, parts: 0 },
    acts: { inserted: 0, updated: 0, unchanged: 0 },
    actsByType: {},
    articles: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    ms: 0,
  };
  const seenIds = new Map<string, number>();
  const actTypes = new Map<string, string>();

  let acts = new Map<string, NewLawAct>();
  let articles: NewLawArticle[] = [];
  /** Dataset ids in this batch; their old rows/parts not rewritten are removed. */
  let sourceIds: string[] = [];

  const flush = async () => {
    if (sourceIds.length === 0) return;
    await db.transaction(async (tx) => {
      const a = await upsertActs(tx, [...acts.values()]);
      report.acts.inserted += a.inserted;
      report.acts.updated += a.updated;
      for (let i = 0; i < articles.length; i += INSERT_SLICE) {
        const b = await upsertArticles(tx, articles.slice(i, i + INSERT_SLICE));
        report.articles.inserted += b.inserted;
        report.articles.updated += b.updated;
        report.articles.unchanged += b.unchanged;
      }
      report.articles.removed += await removeLeftovers(tx, sourceIds, articles.map((r) => r.id));
    });
    acts = new Map();
    articles = [];
    sourceIds = [];
  };

  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  try {
    // Without ORDER BY, DuckDB keeps file order (preserve_insertion_order),
    // which keeps the -dN renaming stable across runs.
    const columns = HF_COLUMNS.map((c) => (c === 'doc_id' ? 'CAST(doc_id AS VARCHAR) AS doc_id' : c));
    const result = await conn.stream(
      `SELECT ${columns.join(', ')} FROM read_parquet('${parquetPath.replaceAll("'", "''")}')`,
    );

    for (;;) {
      const chunk = await result.fetchChunk();
      if (!chunk || chunk.rowCount === 0) break;
      for (const raw of chunk.getRowObjects([...HF_COLUMNS])) {
        const row = raw as unknown as HfRow;
        report.rows++;
        const id = uniqueId(seenIds, row.id ?? '');
        if (id !== row.id) report.renamedDuplicateIds++;

        const mapped = mapRow(row, id);
        if (!mapped.ok) {
          report.skipped[mapped.reason]++;
          continue;
        }
        acts.set(mapped.act.docId, mapped.act);
        actTypes.set(mapped.act.docId, mapped.act.actType);
        const rows = chunkArticle(mapped.article);
        if (rows.length > 1) {
          report.split.articles++;
          report.split.parts += rows.length;
        }
        articles.push(...rows);
        sourceIds.push(mapped.article.id);
        if (sourceIds.length >= batchSize) await flush();
      }
      onProgress?.(report.rows);
    }
    await flush();
  } finally {
    conn.closeSync();
    instance.closeSync();
  }

  report.acts.unchanged = actTypes.size - report.acts.inserted - report.acts.updated;
  for (const type of actTypes.values()) {
    report.actsByType[type] = (report.actsByType[type] ?? 0) + 1;
  }
  report.ms = Date.now() - started;
  return report;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Counts rows from `RETURNING (xmax = 0)`: true = inserted, false = updated. */
function count(rows: { inserted: boolean }[], total: number): UpsertCounts {
  const inserted = rows.filter((r) => r.inserted).length;
  const updated = rows.length - inserted;
  return { inserted, updated, unchanged: total - rows.length };
}

async function upsertActs(tx: Tx, rows: NewLawAct[]): Promise<UpsertCounts> {
  // A status confirmed against lex.uz (status_checked) wins over the dataset's.
  const status = sql`CASE WHEN ${lawActs.statusChecked} THEN ${lawActs.status} ELSE excluded.status END`;
  const set = {
    actGroupId: excluded('act_group_id'),
    title: excluded('title'),
    actType: excluded('act_type'),
    docNumber: excluded('doc_number'),
    docDate: excluded('doc_date'),
    versionDate: excluded('version_date'),
    status,
    language: excluded('language'),
    sourceUrl: excluded('source_url'),
  };
  const returned = await tx
    .insert(lawActs)
    .values(rows)
    .onConflictDoUpdate({
      target: lawActs.docId,
      set,
      // Never touch acts imported from lex.uz; skip writes that change nothing.
      setWhere: sql`${lawActs.source} = 'hf' AND (
        ${lawActs.actGroupId}, ${lawActs.title}, ${lawActs.actType}, ${lawActs.docNumber},
        ${lawActs.docDate}, ${lawActs.versionDate}, ${lawActs.status}, ${lawActs.language}, ${lawActs.sourceUrl}
      ) IS DISTINCT FROM (
        excluded.act_group_id, excluded.title, excluded.act_type, excluded.doc_number,
        excluded.doc_date, excluded.version_date, ${status}, excluded.language, excluded.source_url
      )`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return count(returned, rows.length);
}

/**
 * Deletes rows that belonged to these dataset articles but were not written
 * this time: the whole row of an article that is now split, parts of an
 * article that is no longer split, or parts beyond a shorter new split.
 */
async function removeLeftovers(tx: Tx, sourceIds: string[], keptIds: string[]): Promise<number> {
  // One array parameter per list: a batch with a few huge acts can have tens
  // of thousands of parts, more than Postgres allows as separate parameters.
  const sources = sql`${sql.param(sourceIds)}::text[]`;
  const kept = sql`${sql.param(keptIds)}::text[]`;
  const removed = await tx
    .delete(lawArticles)
    .where(
      sql`(${lawArticles.id} = ANY(${sources}) OR ${lawArticles.parentId} = ANY(${sources}))
        AND ${lawArticles.id} <> ALL(${kept})`,
    )
    .returning({ id: lawArticles.id });
  return removed.length;
}

async function upsertArticles(tx: Tx, rows: NewLawArticle[]): Promise<UpsertCounts> {
  const returned = await tx
    .insert(lawArticles)
    .values(rows)
    .onConflictDoUpdate({
      target: lawArticles.id,
      set: {
        docId: excluded('doc_id'),
        parentId: excluded('parent_id'),
        chunkIndex: excluded('chunk_index'),
        articleNumber: excluded('article_number'),
        part: excluded('part'),
        chapter: excluded('chapter'),
        title: excluded('title'),
        text: excluded('text'),
        textNorm: excluded('text_norm'),
        nTokens: excluded('n_tokens'),
        qualityFlag: excluded('quality_flag'),
        language: excluded('language'),
        // A changed text needs a new embedding.
        embedding: sql`CASE WHEN ${lawArticles.textNorm} = excluded.text_norm THEN ${lawArticles.embedding} ELSE NULL END`,
      },
      setWhere: sql`(
        ${lawArticles.docId}, ${lawArticles.parentId}, ${lawArticles.chunkIndex}, ${lawArticles.articleNumber},
        ${lawArticles.part}, ${lawArticles.chapter}, ${lawArticles.title}, ${lawArticles.text},
        ${lawArticles.nTokens}, ${lawArticles.qualityFlag}, ${lawArticles.language}
      ) IS DISTINCT FROM (
        excluded.doc_id, excluded.parent_id, excluded.chunk_index, excluded.article_number,
        excluded.part, excluded.chapter, excluded.title, excluded.text,
        excluded.n_tokens, excluded.quality_flag, excluded.language
      )`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return count(returned, rows.length);
}
