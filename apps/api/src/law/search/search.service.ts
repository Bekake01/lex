import { Inject, Injectable, Optional } from '@nestjs/common';
import { count, eq, inArray, max, sql, type SQL } from 'drizzle-orm';
import type { LawArticleHit, MetaResponse } from '../law.types.js';
import { DB, type Db } from '../../db/db.module.js';
import { lawActs, lawArticles, lawSyncRuns } from '../../db/schema/index.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { anchorDocIds } from '../lexuz/core-acts.js';
import { fuseRankings, queryStems, toTsQuery } from './query.js';
import type { SearchInput } from './schemas.js';

/**
 * Safety net for hit text. Long articles are split into parts of about
 * 1,600 tokens by chunking (Phase 5); until a row is split it could be
 * millions of characters, which no caller can use.
 */
export const MAX_HIT_TEXT = 12_000;

/** `AND a.doc_id = ANY(…)` when a ranking is restricted to some acts (anchors). One array parameter. */
function docFilter(onlyDocs: string[] | undefined): SQL {
  return onlyDocs?.length ? sql`AND a.doc_id = ANY(${sql.param(onlyDocs)}::text[])` : sql``;
}

/** How deep each query's ranking goes before fusion. */
const PER_QUERY = 50;
/** Rows kept by the cheap first ranking stage for the heading check. */
const CANDIDATES = 300;

@Injectable()
export class SearchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    // Optional so keyword-only callers (scripts, tests) can leave it out.
    @Optional() private readonly embeddings?: EmbeddingService,
  ) {}

  /**
   * Hybrid search (Phase 8). Each query gets a keyword ranking (stems,
   * headings, ts_rank) and, when embeddings are configured, a vector ranking
   * (cosine distance on law_articles.embedding). All rankings are fused with
   * reciprocal rank fusion and the top `limit` returned. Without embeddings,
   * or when the provider fails, this is the Phase 6 keyword search.
   *
   * Anchors (Phase 9): with a `docType`, each query also gets rankings
   * restricted to that contract type's anchor acts (src/law/lexuz/core-acts.ts),
   * so the core law for a rental or employment contract is always considered.
   */
  async search({ queries, docType, inForceOnly, limit }: SearchInput): Promise<LawArticleHit[]> {
    const anchors = anchorDocIds(docType);
    // Queries that reduce to the same stems are searched once.
    const byTsQuery = new Map<string, string[]>();
    for (const q of queries) {
      const tsQuery = toTsQuery(q);
      if (tsQuery && !byTsQuery.has(tsQuery)) byTsQuery.set(tsQuery, queryStems(q));
    }
    const keyword = Promise.all(
      [...byTsQuery].flatMap(([tsQuery, stems]) => [
        this.rankIds(tsQuery, stems, inForceOnly),
        ...(anchors.length ? [this.rankIds(tsQuery, stems, inForceOnly, anchors)] : []),
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
      v ? [this.vectorRank(v, inForceOnly), ...(anchors.length ? [this.vectorRank(v, inForceOnly, anchors)] : [])] : [],
    );
    return Promise.all(lists);
  }

  /** Nearest rows by cosine distance (HNSW index on embedding). Rows not embedded yet are skipped. */
  private async vectorRank(vector: number[], inForceOnly: boolean, onlyDocs?: string[]): Promise<string[]> {
    const literal = `[${vector.join(',')}]`;
    // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
    const result = (await this.db.execute(sql`
      SELECT a.id
      FROM law_articles a
      JOIN law_acts b ON b.doc_id = a.doc_id
      WHERE a.embedding IS NOT NULL ${inForceOnly ? sql`AND b.status <> 'repealed'` : sql``} ${docFilter(onlyDocs)}
      ORDER BY a.embedding <=> ${literal}::vector, a.id
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
          latest: max(lawActs.versionDate),
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
   * Ranking, strongest signal first:
   * 1. share of the query's words in the heading (the article title, or the
   *    act title for flat acts), counted double: headings name the topic
   * 2. share of the query's words anywhere in the row
   * 3. ts_rank, scaled into 0..1, only to break ties
   * Plain ts_rank alone favours long documents that repeat every common word.
   *
   * Two stages, because common words match most of the index: first the
   * cheap signals (2, 3) keep the best CANDIDATES rows, then the heading
   * (1) is checked on those only, with each heading parsed once.
   */
  private async rankIds(tsQuery: string, stems: string[], inForceOnly: boolean, onlyDocs?: string[]): Promise<string[]> {
    const query = sql`to_tsquery('simple', ${tsQuery})`;
    const share = (vector: SQL) =>
      sql.join(
        stems.map((s) => sql`(${vector} @@ to_tsquery('simple', ${`'${s.replaceAll("'", "''")}':*`}))::int`),
        sql` + `,
      );
    const n = stems.length;
    // node-postgres and PGlite both return { rows }; the driver-agnostic Db type doesn't say so.
    const result = (await this.db.execute(sql`
      WITH candidates AS (
        SELECT a.id, coalesce(a.title, b.title) AS heading,
               (${share(sql`a.tsv`)})::float / ${n} AS body,
               ts_rank(a.tsv, ${query}, 32) AS density
        FROM law_articles a
        JOIN law_acts b ON b.doc_id = a.doc_id
        WHERE a.tsv @@ ${query} ${inForceOnly ? sql`AND b.status <> 'repealed'` : sql``} ${docFilter(onlyDocs)}
        ORDER BY body DESC, density DESC, a.id
        LIMIT ${CANDIDATES}
      )
      SELECT c.id
      FROM candidates c
      CROSS JOIN LATERAL (SELECT to_tsvector('simple', lower(c.heading)) AS h OFFSET 0) parsed
      ORDER BY 2.0 * (${share(sql`parsed.h`)})::float / ${n} + c.body + c.density DESC, c.id
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
