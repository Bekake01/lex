/**
 * The internal interface between the AI track (B) and the law-data track (A),
 * frozen on day 2. Changes are add-only: new optional fields or new methods.
 *
 * The real implementation is `DbLawSearchService` over `LawModule`
 * (`src/law/`); the shapes below mirror `src/law/law.types.ts`.
 * Until A's `/search` is live, `FakeLawSearchService` answers from fixtures.
 */
import type { ActType, ContractType } from '@lex/contracts';

export interface LawSearchQuery {
  /** Uzbek Latin queries written by Claude in the classify call. 1–20. */
  queries: string[];
  docType?: ContractType;
  /** Default true. */
  inForceOnly?: boolean;
  /** Default 30. */
  limit?: number;
}

export interface LawArticleHit {
  /** "{docId}-a{articleNumber}", "{docId}-full", or a chunk id. */
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

export interface LawSearchService {
  /** Anchor acts for `docType` are always included. */
  search(q: LawSearchQuery): Promise<LawArticleHit[]>;
  /** Used by the citation check to confirm an article really exists. */
  getArticles(ids: string[]): Promise<LawArticleHit[]>;
  /** "checked against legislation as of …", or null when unknown. */
  indexVersionDate(): Promise<string | null>;
}

export const LAW_SEARCH = Symbol('LAW_SEARCH');

/* ----------------------------------------------------- document processing -- */

export interface Clause {
  ref: string;
  heading?: string;
  text: string;
  /** Character offsets into `ExtractedDoc.text`. */
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

export interface ApplyEdit {
  original: string;
  replacement: string;
}

export interface DocProcessingService {
  extractText(bytes: Uint8Array, contentType: string): Promise<ExtractedDoc>;
  /** DOCX in, DOCX out, formatting preserved. */
  applyEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array>;
}

export const DOC_PROCESSING = Symbol('DOC_PROCESSING');

/** Thrown when an `original` is found 0 or 2+ times in the document. */
export class EditNotFoundError extends Error {
  constructor(readonly index: number) {
    super(`Edit ${index}: original text not found exactly once`);
    this.name = 'EditNotFoundError';
  }
}
