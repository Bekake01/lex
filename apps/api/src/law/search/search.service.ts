import { Inject, Injectable, Optional } from '@nestjs/common';
import { count, eq, inArray, max, sql, type SQL } from 'drizzle-orm';
import type { LawArticleHit, MetaResponse } from '../law.types.js';
import { DB, type Db } from '../../db/db.module.js';
import { lawActs, lawArticles, lawSyncRuns } from '../../db/schema/index.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { anchorDocIds } from '../lexuz/core-acts.js';
import { definitionTopic, fuseRankings, mostWordsTsQuery, prefixTerm, queryStems, toTsQuery } from './query.js';
import type { SearchInput } from './schemas.js';

/**
 * Safety net for hit text. Long articles are split into parts of about
 * 1,600 tokens by chunking; until a row is split it could be
 * millions of characters, which no caller can use.
 */
export const MAX_HIT_TEXT = 12_000;

/** `AND a.doc_id = ANY(…)` when a ranking is restricted to some acts (anchors). One array parameter. */
function docFilter(onlyDocs: string[] | undefined): SQL {
  return onlyDocs?.length ? sql`AND a.doc_id = ANY(${sql.param(onlyDocs)}::text[])` : sql``;
}

/** How many of the query's stems a tsvector contains: one `@@` per stem, summed. */
function share(stems: string[], vector: SQL): SQL {
  return sql.join(
    stems.map((s) => sql`(${vector} @@ to_tsquery('simple', ${prefixTerm(s)}))::int`),
    sql` + `,
  );
}

/** How deep each query's ranking goes before fusion. */
const PER_QUERY = 50;
/** Rows kept from each candidate set (heading matches, most-words body matches). */
const CANDIDATES = 300;
/** Below this many focused rows, the broad any-word ranking fills the rest. */
const MIN_FOCUSED = 10;

/** The heading of a law's definitions article: "Asosiy tushunchalar". */
const DEFINITIONS_HEADING = sql`to_tsquery('simple', 'asosiy:* & tushuncha:*')`;
/** Definitions articles considered for one "what does X mean" query. */
const DEFINITION_CANDIDATES = 20;
/** Lifts the definitions article above articles that merely name X in their heading. */
const DEFINITION_BOOST = 1.5;
/** …a little more when the act itself is about X ("Tijorat siri toʻgʻrisida"). */
const ACT_TITLE_BOOST = 0.5;

/**
 * Tie-breaker by act rank (constitution > code > law > decree) and core
 * acts. Kept below the ts_rank scale on purpose: it reorders near-equal
 * rows, it never outweighs matching more of the query.
 */
const ACT_RANK_BOOST = sql`(CASE b.act_type
    WHEN 'constitution' THEN 0.06 WHEN 'code' THEN 0.05 WHEN 'law' THEN 0.03 WHEN 'decree' THEN 0.01
    ELSE 0 END + CASE WHEN b.core THEN 0.02 ELSE 0 END)`;

/** Nearest rows fetched from the HNSW index before the "not repealed" filter. */
const VECTOR_OVERFETCH = 100;

/** One distinct keyword query, prepared once per search. */
interface KeywordQuery {
  tsQuery: string;
  stems: string[];
  /** tsquery of rows holding most of the stems (index-backed candidate set). */
  mostWords: string;
  /** For "what does X mean" queries: the stems of X. */
  topic: string[] | null;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    // Optional so keyword-only callers (scripts, tests) can leave it out.
    @Optional() private readonly embeddings?: EmbeddingService,
  ) {}

  /**
   * Hybrid search. Each query gets a keyword ranking (stems,
   * headings, ts_rank) and, when embeddings are configured, a vector ranking
   * (cosine distance on law_articles.embedding). All rankings are fused with
   * reciprocal rank fusion and the top `limit` returned. Without embeddings,
   * or when the provider fails, this is the keyword search alone.
   *
   * Anchors: with a `docType`, each query also gets rankings
   * restricted to that contract type's anchor acts (src/law/lexuz/core-acts.ts),
   * so the core law for a rental or employment contract is always considered.
   */
  async search({ queries, docType, inForceOnly, limit }: SearchInput): Promise<LawArticleHit[]> {
    const anchors = anchorDocIds(docType);
    // Queries that reduce to the same stems are searched once.
    const byTsQuery = new Map<string, KeywordQuery>();
    for (const q of queries) {
      const tsQuery = toTsQuery(q);
      if (!tsQuery || byTsQuery.has(tsQuery)) continue;
      const stems = queryStems(q);
      byTsQuery.set(tsQuery, { tsQuery, stems, mostWords: mostWordsTsQuery(stems)!, topic: definitionTopic(q) });
    }
    const keyword = Promise.all(
      [...byTsQuery.values()].flatMap((q) => [
        this.rankIds(q, inForceOnly),
        ...(anchors.length ? [this.rankIds(q, inForceOnly, anchors)] : []),
      ]),
    );
    const vector = this.embeddings?.enabled ? this.vectorRankings(queries, inForceOnly, anchors) : Promise.resolve([]);

    const rankings = [...(await keyword), ...(await vector)].filter((r) => r.length > 0);
    if (rankings.length === 0) return [];
    const fused = [...fuseRankings(rankings)].sort((a, b) => b[1] - a[1]).slice(0, limit);

    const byId = new Map((await this.load(fused.map(([id]) => id))).map((h) => [h.articleId, h]));
    return fused.flatMap(([id, score]) => {
      const hit = byId.get(id);
      return hit ? [{ ...hit, score: Number(score.toFixed(6)) }] : [];
    });
  }

  /**
   * One vector ranking per distinct query (a query the provider could not
   * embed gets none), plus, with anchors, one restricted to the anchor acts.
   */
  private async vectorRankings(queries: string[], inForceOnly: boolean, anchors: string[] = []): Promise<string[][]> {
    const distinct = [...new Set(queries.map((q) => EmbeddingService.queryText(q)).filter(Boolean))];
    const vectors = await this.embeddings!.embedQueries(distinct);
    const lists = vectors.flatMap((v) =>
      v ? [this.vectorRank(v, inForceOnly), ...(anchors.length ? [this.vectorRankIn(v, inForceOnly, anchors)] : [])] : [],
    );
    return Promise.all(lists);
  }

  /**
   * Nearest rows by cosine distance, from the HNSW index. The index is only
   * used when the inner query orders by the distance alone, with no join or
   * filter, so it over-fetches and drops repealed acts after.
   * `ef_search` must be at least the LIMIT, or HNSW returns fewer rows.
   */
  private async vectorRank(vector: number[], inForceOnly: boolean): Promise<string[]> {
    const literal = `[${vector.join(',')}]`;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${VECTOR_OVERFETCH}`));
      // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
      const result = (await tx.execute(sql`
        SELECT n.id
        FROM (
          SELECT a.id, a.doc_id, a.embedding <=> ${literal}::vector AS distance
          FROM law_articles a
          WHERE a.embedding IS NOT NULL
          ORDER BY a.embedding <=> ${literal}::vector
          LIMIT ${VECTOR_OVERFETCH}
        ) n
        JOIN law_acts b ON b.doc_id = n.doc_id
        ${inForceOnly ? sql`WHERE b.status <> 'repealed'` : sql``}
        ORDER BY n.distance, n.id
        LIMIT ${PER_QUERY}
      `)) as unknown as { rows: { id: string }[] };
      return result.rows.map((r) => r.id);
    });
  }

  /**
   * Nearest rows within some acts (anchors), by exact distance. The anchor
   * acts are a few thousand rows, so an exact scan through the doc_id index
   * is fast, and HNSW would post-filter its nearest rows down to almost none.
   * `+ 0` keeps the planner off the HNSW index.
   */
  private async vectorRankIn(vector: number[], inForceOnly: boolean, onlyDocs: string[]): Promise<string[]> {
    const literal = `[${vector.join(',')}]`;
    // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
    const result = (await this.db.execute(sql`
      SELECT a.id
      FROM law_articles a
      JOIN law_acts b ON b.doc_id = a.doc_id
      WHERE a.embedding IS NOT NULL ${inForceOnly ? sql`AND b.status <> 'repealed'` : sql``} ${docFilter(onlyDocs)}
      ORDER BY (a.embedding <=> ${literal}::vector) + 0, a.id
      LIMIT ${PER_QUERY}
    `)) as unknown as { rows: { id: string }[] };
    return result.rows.map((r) => r.id);
  }

  /** Articles by id, in the order asked; unknown ids are left out. */
  async articles(ids: string[]): Promise<LawArticleHit[]> {
    const byId = new Map((await this.load([...new Set(ids)])).map((h) => [h.articleId, h]));
    return ids.flatMap((id) => {
      const hit = byId.get(id);
      return hit ? [hit] : [];
    });
  }

  async meta(): Promise<MetaResponse> {
    const [[acts], [articles], [sync]] = await Promise.all([
      this.db
        .select({
          total: count(),
          core: count(sql`CASE WHEN ${lawActs.core} THEN 1 END`),
          // Acts that come into force later carry a future date; skip them.
          latest: sql<
            string | null
          >`max(${lawActs.versionDate}) filter (where ${lawActs.versionDate} <= current_date)`,
        })
        .from(lawActs),
      this.db.select({ total: count() }).from(lawArticles),
      this.db
        .select({ last: max(lawSyncRuns.finishedAt) })
        .from(lawSyncRuns)
        .where(eq(lawSyncRuns.status, 'ok')),
    ]);
    return {
      indexVersionDate: acts?.latest ?? null,
      acts: acts?.total ?? 0,
      articles: articles?.total ?? 0,
      coreActs: acts?.core ?? 0,
      lastSyncAt: sync?.last ? new Date(sync.last).toISOString() : null,
    };
  }

  /**
   * Keyword ranking of one query, strongest signal first:
   * 1. share of the query's words in the heading (the article title, or the
   *    act title for flat acts), counted double: headings name the topic
   * 2. share of the query's words anywhere in the row
   * 3. ts_rank, scaled into 0..1, mostly to break ties
   * 4. small nudges by act rank and core acts; for a "what does X mean"
   *    query, a big boost for the "Asosiy tushunchalar" (definitions)
   *    article that mentions X
   * Plain ts_rank alone favours long documents that repeat every common word.
   *
   * Only a few candidates are scored, taken from index-backed
   * sets instead of every row that matches any one word: rows whose heading
   * matches, and rows whose body has most of the words. When those give too
   * few rows, the broad any-word ranking fills the rest.
   */
  private async rankIds(q: KeywordQuery, inForceOnly: boolean, onlyDocs?: string[]): Promise<string[]> {
    const ids = await this.rankFocused(q, inForceOnly, onlyDocs);
    if (ids.length >= MIN_FOCUSED) return ids;
    const seen = new Set(ids);
    const broad = await this.rankBroad(q, inForceOnly, onlyDocs);
    return [...ids, ...broad.filter((id) => !seen.has(id))].slice(0, PER_QUERY);
  }

  private async rankFocused(q: KeywordQuery, inForceOnly: boolean, onlyDocs?: string[]): Promise<string[]> {
    const query = sql`to_tsquery('simple', ${q.tsQuery})`;
    const most = sql`to_tsquery('simple', ${q.mostWords})`;
    const filters = sql`${inForceOnly ? sql`AND b.status <> 'repealed'` : sql``} ${docFilter(onlyDocs)}`;
    const n = q.stems.length;
    const heading = sql`coalesce(a.heading_tsv, ''::tsvector)`;
    const topic = q.topic ? sql`to_tsquery('simple', ${q.topic.map(prefixTerm).join(' & ')})` : null;

    const definitions = topic
      ? sql`, definition_hits AS (
          SELECT a.id
          FROM law_articles a
          JOIN law_acts b ON b.doc_id = a.doc_id
          WHERE a.heading_tsv @@ ${DEFINITIONS_HEADING} AND a.tsv @@ ${topic} ${filters}
          LIMIT ${DEFINITION_CANDIDATES}
        )`
      : sql``;
    const definitionBoost = topic
      ? sql` + CASE WHEN a.id IN (SELECT id FROM definition_hits)
               THEN ${sql.raw(String(DEFINITION_BOOST))} + ${sql.raw(String(ACT_TITLE_BOOST))} * (to_tsvector('simple', lower(b.title)) @@ ${topic})::int
               ELSE 0 END`
      : sql``;

    // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
    const result = (await this.db.execute(sql`
      WITH heading_hits AS (
        SELECT a.id
        FROM law_articles a
        JOIN law_acts b ON b.doc_id = a.doc_id
        WHERE a.heading_tsv @@ ${query} ${filters}
        ORDER BY (${share(q.stems, sql`a.heading_tsv`)}) DESC, ts_rank(a.heading_tsv, ${query}) DESC, a.id
        LIMIT ${CANDIDATES}
      ), body_hits AS (
        SELECT a.id
        FROM law_articles a
        JOIN law_acts b ON b.doc_id = a.doc_id
        WHERE a.tsv @@ ${most} ${filters}
        ORDER BY (${share(q.stems, sql`a.tsv`)}) DESC, ts_rank(a.tsv, ${query}, 32) DESC, a.id
        LIMIT ${CANDIDATES}
      )${definitions}, candidates AS (
        SELECT id FROM heading_hits UNION SELECT id FROM body_hits
        ${topic ? sql`UNION SELECT id FROM definition_hits` : sql``}
      )
      SELECT a.id
      FROM candidates c
      JOIN law_articles a ON a.id = c.id
      JOIN law_acts b ON b.doc_id = a.doc_id
      ORDER BY 2.0 * (${share(q.stems, heading)})::float / ${n}
             + (${share(q.stems, sql`a.tsv`)})::float / ${n}
             + ts_rank(a.tsv, ${query}, 32)
             + ${ACT_RANK_BOOST}${definitionBoost} DESC, a.id
      LIMIT ${PER_QUERY}
    `)) as unknown as { rows: { id: string }[] };
    return result.rows.map((r) => r.id);
  }

  /**
   * The original broad ranking: scores every row that matches any query word.
   * Slow on common words, so only a fallback when the focused sets are small.
   */
  private async rankBroad(q: KeywordQuery, inForceOnly: boolean, onlyDocs?: string[]): Promise<string[]> {
    const query = sql`to_tsquery('simple', ${q.tsQuery})`;
    const n = q.stems.length;
    // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
    const result = (await this.db.execute(sql`
      WITH candidates AS (
        SELECT a.id, coalesce(a.heading_tsv, ''::tsvector) AS heading,
               (${share(q.stems, sql`a.tsv`)})::float / ${n} AS body,
               ts_rank(a.tsv, ${query}, 32) AS density
        FROM law_articles a
        JOIN law_acts b ON b.doc_id = a.doc_id
        WHERE a.tsv @@ ${query} ${inForceOnly ? sql`AND b.status <> 'repealed'` : sql``} ${docFilter(onlyDocs)}
        ORDER BY body DESC, density DESC, a.id
        LIMIT ${CANDIDATES}
      )
      SELECT c.id
      FROM candidates c
      ORDER BY 2.0 * (${share(q.stems, sql`c.heading`)})::float / ${n} + c.body + c.density DESC, c.id
      LIMIT ${PER_QUERY}
    `)) as unknown as { rows: { id: string }[] };
    return result.rows.map((r) => r.id);
  }

  /** Builds hits field by field: only contract fields leave the service. */
  private async load(ids: string[]): Promise<LawArticleHit[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        articleId: lawArticles.id,
        actTitle: lawActs.title,
        actType: lawActs.actType,
        articleNumber: lawArticles.articleNumber,
        text: sql<string>`left(${lawArticles.text}, ${MAX_HIT_TEXT + 1})`,
        sourceUrl: lawActs.sourceUrl,
        versionDate: lawActs.versionDate,
        docDate: lawActs.docDate,
        core: lawActs.core,
      })
      .from(lawArticles)
      .innerJoin(lawActs, eq(lawActs.docId, lawArticles.docId))
      .where(inArray(lawArticles.id, ids));

    return rows.map((r) => ({
      articleId: r.articleId,
      actTitle: r.actTitle,
      actType: r.actType,
      articleNumber: r.articleNumber,
      text: r.text.length > MAX_HIT_TEXT ? `${r.text.slice(0, MAX_HIT_TEXT)}…` : r.text,
      sourceUrl: r.sourceUrl,
      versionDate: r.versionDate ?? r.docDate ?? '',
      core: r.core,
      score: 0,
    }));
  }
}
