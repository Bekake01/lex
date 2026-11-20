import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from 'drizzle-orm/pg-core';

/** Both candidate embedding models (voyage-3.5, bge-m3) produce 1024-d vectors. */
export const EMBEDDING_DIMENSIONS = 1024;

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const actType = pgEnum('act_type', [
  'constitution',
  'code',
  'law',
  'decree',
  'resolution',
  'order',
  'other',
]);
export const actStatus = pgEnum('act_status', ['in_force', 'repealed', 'unknown']);
export const actSource = pgEnum('act_source', ['hf', 'lexuz']);
export const syncStatus = pgEnum('sync_status', ['running', 'ok', 'failed']);

export const lawActs = pgTable(
  'law_acts',
  {
    docId: text('doc_id').primaryKey(),
    /** Groups editions/translations of the same act. */
    actGroupId: text('act_group_id'),
    title: text('title').notNull(),
    actType: actType('act_type').notNull(),
    docNumber: text('doc_number'),
    docDate: date('doc_date', { mode: 'string' }),
    versionDate: date('version_date', { mode: 'string' }),
    status: actStatus('status').notNull().default('unknown'),
    /** true only after the status was confirmed against lex.uz. */
    statusChecked: boolean('status_checked').notNull().default(false),
    core: boolean('core').notNull().default(false),
    language: text('language').notNull(),
    sourceUrl: text('source_url').notNull(),
    source: actSource('source').notNull(),
  },
  (t) => [index('law_acts_type_status_core_idx').on(t.actType, t.status, t.core)],
);

export const lawArticles = pgTable(
  'law_articles',
  {
    id: text('id').primaryKey(),
    docId: text('doc_id')
      .notNull()
      .references(() => lawActs.docId, { onDelete: 'cascade' }),
    articleNumber: text('article_number'),
    part: text('part'),
    chapter: text('chapter'),
    title: text('title'),
    text: text('text').notNull(),
    /** normalizeUz(text): unified apostrophes, Latin script, collapsed whitespace. */
    textNorm: text('text_norm').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    nTokens: integer('n_tokens'),
    qualityFlag: text('quality_flag'),
    language: text('language').notNull(),
    // `simple` config: Postgres has no Uzbek stemmer, so no stemming at all.
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('simple', text_norm)`),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    index('law_articles_doc_id_idx').on(t.docId),
    index('law_articles_tsv_idx').using('gin', t.tsv),
    index('law_articles_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const lawSyncRuns = pgTable('law_sync_runs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: syncStatus('status').notNull().default('running'),
  actsChecked: integer('acts_checked').notNull().default(0),
  actsUpdated: integer('acts_updated').notNull().default(0),
  error: text('error'),
});

export type LawAct = typeof lawActs.$inferSelect;
export type NewLawAct = typeof lawActs.$inferInsert;
export type LawArticle = typeof lawArticles.$inferSelect;
export type NewLawArticle = typeof lawArticles.$inferInsert;
