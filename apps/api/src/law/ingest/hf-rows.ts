import type { NewLawAct, NewLawArticle } from '../../db/schema/index.js';
import { countTokens, normalizeUz } from '../text/index.js';

/**
 * One row of `articles/train-*.parquet` from the Hugging Face dataset
 * sukhrobnurali/uzbek-legal-corpus, as read by DuckDB (all values as text).
 * Columns not listed here (amendment_note, cross_references, okoz/tsz codes,
 * n_tokens) are not imported.
 */
export interface HfRow {
  id: string | null;
  act_group_id: string | null;
  doc_id: string | null;
  doc_title: string | null;
  doc_type: string | null;
  doc_number: string | null;
  doc_date: string | null;
  version_date: string | null;
  status: string | null;
  part: string | null;
  chapter: string | null;
  article_number: string | null;
  article_title: string | null;
  article_text: string | null;
  source_url: string | null;
  quality_flag: string | null;
}

export const HF_COLUMNS = [
  'id', 'act_group_id', 'doc_id', 'doc_title', 'doc_type', 'doc_number', 'doc_date',
  'version_date', 'status', 'part', 'chapter', 'article_number', 'article_title',
  'article_text', 'source_url', 'quality_flag',
] as const satisfies readonly (keyof HfRow)[];

/** Why a row was not imported. */
/** Why a dataset row was not imported (`from-lexuz`: its act was imported from lex.uz, which wins). */
export type SkipReason = 'too-short' | 'empty-text' | 'missing-id' | 'from-lexuz';

export type MappedRow =
  | { ok: true; act: NewLawAct; article: NewLawArticle }
  | { ok: false; reason: SkipReason };

const ACT_TYPES = new Set(['constitution', 'code', 'law', 'decree', 'resolution', 'order', 'other']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Empty strings in the dataset mean "no value". */
function blank(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function isoDate(v: string | null): string | null {
  const t = blank(v);
  return t && ISO_DATE.test(t) ? t : null;
}

export function mapActType(v: string | null): NonNullable<NewLawAct['actType']> {
  const t = blank(v)?.toLowerCase();
  return t && ACT_TYPES.has(t) ? (t as NonNullable<NewLawAct['actType']>) : 'other';
}

/**
 * The dataset's status is best-effort: in the current snapshot every row says
 * "in-force". It is kept, but statusChecked stays false until lex.uz confirms it.
 */
export function mapStatus(v: string | null): NonNullable<NewLawAct['status']> {
  const t = blank(v)?.toLowerCase().replace(/[\s_]+/g, '-');
  if (t === 'in-force') return 'in_force';
  if (t === 'repealed' || t === 'not-in-force' || t === 'expired') return 'repealed';
  return 'unknown';
}

/**
 * The search text for an article: its heading and body, normalized and
 * lowercased. The heading carries the most specific words ("Mulk ijarasi
 * shartnomasi"), so keyword search must see it too.
 */
export function searchText(title: string | null, text: string): string {
  return normalizeUz(title ? `${title}\n${text}` : text, { lowercase: true });
}

/**
 * Maps one dataset row to an act and an article. `id` is the row's final
 * unique id (see uniqueId).
 */
export function mapRow(row: HfRow, id: string): MappedRow {
  const docId = blank(row.doc_id);
  if (!blank(row.id) || !docId) return { ok: false, reason: 'missing-id' };
  if (row.quality_flag === 'too-short') return { ok: false, reason: 'too-short' };
  const text = normalizeUz(row.article_text ?? '');
  if (!text) return { ok: false, reason: 'empty-text' };
  const title = blank(row.article_title);

  return {
    ok: true,
    act: {
      docId,
      actGroupId: blank(row.act_group_id),
      title: blank(row.doc_title) ?? docId,
      actType: mapActType(row.doc_type),
      docNumber: blank(row.doc_number),
      docDate: isoDate(row.doc_date),
      versionDate: isoDate(row.version_date),
      status: mapStatus(row.status),
      language: 'uz-latn',
      sourceUrl: blank(row.source_url) ?? `https://lex.uz/uz/docs/${docId}`,
      source: 'hf',
    },
    article: {
      id,
      docId,
      articleNumber: blank(row.article_number),
      part: blank(row.part),
      chapter: blank(row.chapter),
      title,
      text,
      textNorm: searchText(title, text),
      chunkIndex: 0,
      nTokens: countTokens(text),
      qualityFlag: blank(row.quality_flag),
      language: 'uz-latn',
    },
  };
}

/**
 * The dataset reuses some ids (amending laws whose quoted articles all landed
 * under one `{doc}-full` id, each with different text). Every row is kept:
 * the first keeps its id, later ones become `{id}-d2`, `{id}-d3`… in file
 * order, which is stable across runs of the same file.
 */
export function uniqueId(seen: Map<string, number>, id: string): string {
  const n = (seen.get(id) ?? 0) + 1;
  seen.set(id, n);
  return n === 1 ? id : `${id}-d${n}`;
}
