import type { NewLawArticle } from '../../db/schema/index.js';
import { countTokens } from '../text/index.js';
import { searchText } from './hf-rows.js';

/** Sizes in approximate tokens (countTokens). */
export const CHUNK_LIMITS = {
  /** Numbered articles are split only above this size… */
  articleSplitAt: 1500,
  /** …into parts of at most this size (leaves room under the hard cap). */
  articleMax: 1200,
  articleMin: 300,
  /** Flat acts (no article structure) become 400–800-token chunks. */
  flatSplitAt: 800,
  flatMax: 800,
  flatMin: 400,
  /** No stored row should exceed this. */
  hardMax: 1600,
} as const;

/**
 * Boundaries from strongest to weakest. The dataset collapses paragraphs
 * into one line, so sentence ends are the best boundary we have; `;` and
 * `:` end list items in legal text; plain spaces are the last resort.
 */
const BOUNDARIES = [
  /(?<=[.!?…]["'»”)]*)\s+/u,
  /(?<=[;:])\s+/u,
  /\s+/u,
];

/** Cuts a piece with no usable boundary (one enormous "word") by characters. */
function hardCut(text: string, max: number): string[] {
  // ~3.5 chars per token for Latin text; slightly under to stay below max.
  const size = Math.max(1, Math.floor(max * 3));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Splits into pieces of at most `max` tokens, preferring strong boundaries. */
function pieces(text: string, max: number, level = 0): string[] {
  if (countTokens(text) <= max) return [text];
  if (level >= BOUNDARIES.length) return hardCut(text, max);
  return text
    .split(BOUNDARIES[level])
    .filter((p) => p.length > 0)
    .flatMap((p) => pieces(p, max, level + 1));
}

interface Group {
  pieces: { text: string; size: number }[];
  size: number;
}

/**
 * Splits text into chunks of at most `max` tokens (approximately), packing
 * whole sentences together. A too-small last chunk takes sentences from the
 * end of the one before it until it reaches `min` (never pushing either over
 * `max`). Chunks rejoined with spaces give back the text, apart from the
 * whitespace at the cuts.
 */
export function splitText(text: string, max: number, min: number): string[] {
  if (countTokens(text) <= max) return [text];

  const groups: Group[] = [];
  let current: Group = { pieces: [], size: 0 };
  for (const piece of pieces(text, max)) {
    const size = countTokens(piece);
    if (current.size + size > max && current.pieces.length > 0) {
      groups.push(current);
      current = { pieces: [], size: 0 };
    }
    current.pieces.push({ text: piece, size });
    current.size += size;
  }
  groups.push(current);

  const last = groups[groups.length - 1];
  const prev = groups[groups.length - 2];
  if (prev && last.size < min && prev.size + last.size <= max) {
    prev.pieces.push(...last.pieces);
    prev.size += last.size;
    groups.pop();
  } else if (prev) {
    // Rebalance: move trailing sentences of prev into last.
    while (last.size < min && prev.pieces.length > 1) {
      const moved = prev.pieces[prev.pieces.length - 1];
      if (prev.size - moved.size < min || last.size + moved.size > max) break;
      prev.pieces.pop();
      prev.size -= moved.size;
      last.pieces.unshift(moved);
      last.size += moved.size;
    }
  }

  return groups.map((g) => g.pieces.map((p) => p.text).join(' '));
}

/**
 * Turns one article row into the rows to store. Small rows come back as they
 * are (chunkIndex 0, no parent). Large ones become parts `{id}-p1`, `-p2`…
 * (chunkIndex 1, 2…, parentId = the original id). Each part keeps the
 * article's number, title and chapter, and its search text starts with the
 * title, so every part is findable by the article heading.
 */
export function chunkArticle(article: NewLawArticle): NewLawArticle[] {
  const flat = article.articleNumber == null;
  const splitAt = flat ? CHUNK_LIMITS.flatSplitAt : CHUNK_LIMITS.articleSplitAt;
  const max = flat ? CHUNK_LIMITS.flatMax : CHUNK_LIMITS.articleMax;
  const min = flat ? CHUNK_LIMITS.flatMin : CHUNK_LIMITS.articleMin;

  const whole: NewLawArticle = { ...article, parentId: null, chunkIndex: 0 };
  if ((article.nTokens ?? countTokens(article.text)) <= splitAt) return [whole];

  const parts = splitText(article.text, max, min);
  if (parts.length === 1) return [whole];

  const title = article.title ?? null;
  return parts.map((text, i) => ({
    ...article,
    id: `${article.id}-p${i + 1}`,
    parentId: article.id,
    chunkIndex: i + 1,
    text,
    textNorm: searchText(title, text),
    nTokens: countTokens(text),
    embedding: null,
  }));
}
