const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const DIGIT = /\p{Nd}/u;
const SPACE = /\s/u;

const OKINA = 0x02bb; // ʻ
const TUTUQ = 0x02bc; // ʼ

type Kind = 'latin' | 'cyrillic' | 'digit' | 'space' | 'mark' | 'other';

/** Character class by code point; plain range checks for the common cases. */
function kind(cp: number, ch: string): Kind {
  if (cp < 0x80) {
    if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x41 && cp <= 0x5a)) return 'latin';
    if (cp >= 0x30 && cp <= 0x39) return 'digit';
    if (cp === 0x20 || (cp >= 0x09 && cp <= 0x0d)) return 'space';
    return 'other';
  }
  if (cp >= 0x0400 && cp <= 0x04ff) return 'cyrillic';
  if (cp === OKINA || cp === TUTUQ) return 'mark';
  // Rare characters: exact Unicode classes.
  if (SPACE.test(ch)) return 'space';
  if (LATIN.test(ch)) return 'latin';
  if (CYRILLIC.test(ch)) return 'cyrillic';
  if (DIGIT.test(ch)) return 'digit';
  return 'other';
}

/**
 * Approximate token count, for sizing chunks (not for billing).
 *
 * Embedding and LLM tokenizers split Uzbek and Russian into short pieces:
 * roughly 3.5 Latin letters or 2.5 Cyrillic letters per token. Digits go
 * about 3 per token and each punctuation mark or symbol is about one token.
 * Deterministic and fast (runs over the whole corpus several times while
 * chunking); within about ±25% of real tokenizers on legal text.
 */
export function countTokens(text: string): number {
  let latin = 0;
  let cyrillic = 0;
  let digits = 0;
  let other = 0;

  for (const ch of text) {
    switch (kind(ch.codePointAt(0)!, ch)) {
      case 'latin':
        latin++;
        break;
      case 'cyrillic':
        cyrillic++;
        break;
      case 'digit':
        digits++;
        break;
      case 'other':
        other++;
        break;
      // space, and the oʻ/gʻ mark or separator riding along with their letters
      default:
        break;
    }
  }

  return Math.ceil(latin / 3.5 + cyrillic / 2.5 + digits / 3 + other);
}
