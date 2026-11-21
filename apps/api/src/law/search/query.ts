import { cyrillicToLatinUz, detectScript, normalizeUz } from '../text/index.js';

/**
 * Turning a free-text Uzbek query into a Postgres tsquery.
 *
 * Postgres has no Uzbek stemmer and the index uses the `simple` config, so
 * "shartnomasini" would not match "shartnoma". Uzbek is agglutinative:
 * suffixes stack on a stable stem. So each word is cut back to a likely stem
 * and matched as a prefix (`shartnoma:*`), and words are OR-ed together so a
 * row matching more of them ranks higher instead of being required to match all.
 */

/** Function words that match nearly every article and carry no meaning. */
const STOPWORDS = new Set([
  'va', 'yoki', 'bilan', 'uchun', 'ham', 'bu', 'shu', 'ushbu', 'u', 'bir', 'har',
  'oʻz', 'emas', 'kabi', 'agar', 'lekin', 'ammo', 'yaʼni', 'esa', 'deb', 'boʻyicha',
]);

/**
 * Common noun and verb endings, longest first so the longest match wins.
 * Only one ending is removed; the prefix match covers the rest.
 */
const SUFFIXES = [
  'larining', 'laridagi', 'larning', 'laridan', 'larida', 'lariga', 'larini', 'lardan',
  'larda', 'larga', 'larni', 'lari', 'lar',
  'sining', 'sidagi', 'sidan', 'sida', 'siga', 'sini',
  'ining', 'idagi', 'idan', 'ida', 'iga', 'ini',
  'ning', 'dagi', 'dan', 'tan', 'da', 'ta', 'ga', 'ka', 'qa', 'ni', 'si',
  'ilgan', 'ladi', 'gan', 'adi', 'ishi', 'ish',
].sort((a, b) => b.length - a.length);

/** A stem shorter than this matches too much; keep the longer form instead. */
const MIN_STEM = 4;

/** Normalizes a query the same way article text was normalized at import. */
export function normalizeQuery(query: string): string {
  const latin = detectScript(query).script === 'cyrl' ? cyrillicToLatinUz(query) : query;
  return normalizeUz(latin, { lowercase: true });
}

export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** The distinct search stems of a query, in order. */
export function queryStems(query: string): string[] {
  const words = normalizeQuery(query).match(/[\p{L}\p{N}ʻʼ]+/gu) ?? [];
  const stems = words
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem);
  return [...new Set(stems)];
}

/**
 * The `to_tsquery('simple', …)` source for a query, or null when nothing
 * searchable is left (only stopwords or punctuation).
 */
export function toTsQuery(query: string): string | null {
  const stems = queryStems(query);
  if (stems.length === 0) return null;
  // Quoted so the stem is one operand whatever characters it holds.
  return stems.map(prefixTerm).join(' | ');
}

/** One quoted prefix operand of a tsquery. */
export function prefixTerm(stem: string): string {
  return `'${stem.replaceAll("'", "''")}':*`;
}

/** Most combinations of dropped words we OR together; beyond this, drop fewer. */
const MAX_COMBINATIONS = 40;

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first!, ...c]), ...combinations(rest, k)];
}

/**
 * How many of n query words a row must contain to count as a "most words"
 * body match: all of 1–2, all but one of 3–5, all but two of 6 or more.
 */
export function requiredWords(n: number): number {
  return n <= 2 ? n : n <= 5 ? n - 1 : n - 2;
}

/**
 * A tsquery matching rows that contain most of the stems (see requiredWords):
 * an OR of ANDs, e.g. for a, b, c: `(a & b) | (a & c) | (b & c)`. Unlike the
 * plain OR of toTsQuery, the GIN index keeps this match set small (Phase 10).
 * Null for no stems.
 */
export function mostWordsTsQuery(stems: string[]): string | null {
  if (stems.length === 0) return null;
  let need = requiredWords(stems.length);
  let combos = combinations(stems, need);
  while (combos.length > MAX_COMBINATIONS && need < stems.length) combos = combinations(stems, ++need);
  return combos.map((c) => `(${c.map(prefixTerm).join(' & ')})`).join(' | ');
}

/** Words that make a query ask what something means ("tijorat siri tushunchasi"). */
const DEFINITION_WORDS = ['tushuncha', 'nima', 'deganda', 'degani', 'taʼrif', 'maʼnosi'];

/**
 * For a "what does X mean" query, the stems of X (the words that are not
 * definition words); null for any other query. Such queries are answered by
 * the law's "Asosiy tushunchalar" (definitions) article (Phase 10).
 */
export function definitionTopic(query: string): string[] | null {
  const words = normalizeQuery(query).match(/[\p{L}\p{N}ʻʼ]+/gu) ?? [];
  const isDefinition = (w: string) => DEFINITION_WORDS.some((d) => w.startsWith(d));
  if (!words.some(isDefinition)) return null;
  const topic = queryStems(words.filter((w) => !isDefinition(w)).join(' '));
  return topic.length > 0 ? topic : null;
}

/**
 * Reciprocal rank fusion: merges ranked id lists from several queries.
 * Each list contributes 1 / (k + rank); ids found by several queries rise.
 * Scale-free, so raw ts_rank values from different queries never compete.
 */
export function fuseRankings(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return scores;
}
