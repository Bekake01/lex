/**
 * Law search and document types, shared by the law module, the AI review and
 * the HTTP routes under /law. Originally the lex-api contract (see
 * docs/law-build-plan.md §3); keep changes add-only.
 */

export type DocType = 'rental' | 'employment' | 'sale' | 'services' | 'nda' | 'other';

export type ActType =
  | 'constitution'
  | 'code'
  | 'law'
  | 'decree'
  | 'resolution'
  | 'order'
  | 'other';

export interface LawArticleHit {
  /** "{docId}-a{articleNumber}", "{docId}-full", or a chunk id like "{id}-p2". */
  articleId: string;
  actTitle: string;
  actType: ActType;
  articleNumber: string | null;
  text: string;
  /** lex.uz link to the act. */
  sourceUrl: string;
  /** ISO date of the law text this hit comes from. */
  versionDate: string;
  /** Part of the hand-checked core set. */
  core: boolean;
  score: number;
}

/** GET /health. `null` means "not checked yet". */
export interface HealthResponse {
  ok: boolean;
  db: boolean | null;
  indexVersionDate: string | null;
}

/** POST /law/search */
export interface SearchRequest {
  /** Uzbek Latin (or Russian, from Phase 15) queries. 1–20 items. */
  queries: string[];
  docType?: DocType;
  /** Default true. */
  inForceOnly?: boolean;
  /** Default 30, max 100. */
  limit?: number;
}
export interface SearchResponse {
  hits: LawArticleHit[];
}

/** POST /law/articles/batch */
export interface ArticlesBatchRequest {
  ids: string[];
}
export interface ArticlesBatchResponse {
  articles: LawArticleHit[];
}

/** GET /law/meta */
export interface MetaResponse {
  indexVersionDate: string | null;
  acts: number;
  articles: number;
  coreActs: number;
  lastSyncAt: string | null;
}

/** POST /documents/extract (multipart `file`, PDF or DOCX, ≤ 20 MB) */
export interface Clause {
  ref: string;
  heading?: string;
  text: string;
  /** Character offsets into ExtractedDoc.text. */
  start: number;
  end: number;
}
export interface ExtractedDoc {
  text: string;
  language: 'uz-latn' | 'uz-cyrl' | 'ru' | 'en' | 'mixed';
  pageCount?: number;
  /** True when a PDF has (almost) no text layer. */
  scanned: boolean;
  clauses: Clause[];
}

/**
 * POST /documents/apply-edits (multipart `file` = DOCX, `edits` = JSON of ApplyEdit[])
 * 200 → DOCX bytes. 422 → ApplyEditsError when an `original` is found 0 or 2+ times.
 */
export interface ApplyEdit {
  original: string;
  replacement: string;
}
export interface ApplyEditsError {
  error: 'EDIT_NOT_FOUND';
  index: number;
}
