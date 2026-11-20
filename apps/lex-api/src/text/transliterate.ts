import { OKINA, TUTUQ } from './normalize.js';

/** Lowercase Uzbek Cyrillic → Latin for letters with one fixed spelling. */
const FIXED: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'x', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'i', э: 'e',
  ю: 'yu', я: 'ya', ў: `o${OKINA}`, қ: 'q', ғ: `g${OKINA}`, ҳ: 'h',
  ъ: TUTUQ, ь: '',
};

const CYRILLIC_VOWELS = new Set('аеёиоуўэюяы');
const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);
const isUpper = (ch: string | undefined): boolean =>
  !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();

/**
 * Converts Uzbek Cyrillic to the official Latin alphabet (1995, rev. 2019 marks):
 * - е → `ye` at word start and after a vowel, ъ or ь (yer, poyezd); else `e`
 * - ц → `ts` after a vowel (konstitutsiya); else `s` (sirk, aksiya)
 * - ъ → `ʼ` (maʼlumot), ь dropped (albom)
 * - ў/ғ → `oʻ`/`gʻ`
 * Case follows the source: `Ш` → `Sh` in a word, `SH` in an all-caps word.
 * Non-Cyrillic characters pass through unchanged.
 */
export function cyrillicToLatinUz(text: string): string {
  // Code points are enough: only single-code-point Cyrillic letters are
  // mapped, everything else (emoji included) is copied back as it was.
  const chars = Array.from(text);
  let out = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const prev = chars[i - 1]?.toLowerCase();

    let latin: string;
    if (lower === 'е') {
      const yeContext = !isLetter(prev) || CYRILLIC_VOWELS.has(prev!) || prev === 'ъ' || prev === 'ь';
      latin = yeContext ? 'ye' : 'e';
    } else if (lower === 'ц') {
      latin = prev && CYRILLIC_VOWELS.has(prev) ? 'ts' : 's';
    } else if (lower in FIXED) {
      latin = FIXED[lower];
    } else {
      out += ch;
      continue;
    }

    if (!isUpper(ch) || latin.length === 0) {
      out += latin;
      continue;
    }
    // An uppercase letter inside an all-caps word becomes all caps (SHARTNOMA);
    // a capital at the start of a normal word only capitalizes its first letter (Shartnoma).
    const next = chars[i + 1];
    const allCaps = isUpper(next) || (isUpper(chars[i - 1]) && !isLetter(next));
    out += allCaps ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
  }

  return out;
}
