import type { ExtractedDoc } from '../law.types.js';
import { detectScript } from '../text/index.js';

export type DocumentLanguage = ExtractedDoc['language'];

/** Letters only Uzbek Cyrillic uses (Russian has none of them). */
const UZ_CYRILLIC = /[ўқғҳЎҚҒҲ]/gu;
const CYRILLIC = /\p{Script=Cyrillic}/gu;

/** oʻ / gʻ in any apostrophe spelling, the separator ʼ, and common Uzbek words. */
const UZ_LATIN_MARKERS =
  /\b(?:[og]['‘’`ʻ]|va|bilan|uchun|shartnoma\w*|tomon\w*|toʻg\w*|majbur\w*|haqida|boʻyicha|qilish|etish)\b|ʼ/giu;
const EN_MARKERS = /\b(?:the|and|of|to|shall|agreement|party|parties|this|with|for)\b/giu;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/**
 * The language of a contract, for the review prompt and the UI.
 * - Cyrillic: Uzbek when the Uzbek-only letters ў қ ғ ҳ appear often enough,
 *   otherwise Russian.
 * - Latin: Uzbek when Uzbek markers outnumber English ones, otherwise English.
 * - Both scripts in quantity (or no letters at all): `mixed`.
 */
export function detectLanguage(text: string): DocumentLanguage {
  const { script } = detectScript(text);
  if (script === 'cyrl') {
    const cyr = count(text, CYRILLIC);
    // Uzbek Cyrillic text has ~2–4% of these letters; 0.5% leaves room for short texts.
    return cyr > 0 && count(text, UZ_CYRILLIC) / cyr >= 0.005 ? 'uz-cyrl' : 'ru';
  }
  if (script === 'latn') {
    return count(text, UZ_LATIN_MARKERS) >= count(text, EN_MARKERS) ? 'uz-latn' : 'en';
  }
  return 'mixed';
}
