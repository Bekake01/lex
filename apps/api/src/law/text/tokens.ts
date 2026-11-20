/**
 * Approximate token count, for sizing chunks (not for billing).
 *
 * Embedding and LLM tokenizers split Uzbek and Russian into short pieces:
 * roughly 3.5 Latin letters or 2.5 Cyrillic letters per token. Digits go
 * about 3 per token and each punctuation mark or symbol is about one token.
 * Deterministic and fast; within about ±25% of real tokenizers on legal text.
 */
export function countTokens(text: string): number {
  let latin = 0;
  let cyrillic = 0;
  let digits = 0;
  let other = 0;

  for (const ch of text) {
    if (/\s/u.test(ch)) continue;
    if (/\p{Script=Latin}/u.test(ch)) latin++;
    else if (/\p{Script=Cyrillic}/u.test(ch)) cyrillic++;
    else if (/\p{Nd}/u.test(ch)) digits++;
    // The oʻ/gʻ mark and separator ride along with their letters.
    else if (ch === 'ʻ' || ch === 'ʼ') continue;
    else other++;
  }

  return Math.ceil(latin / 3.5 + cyrillic / 2.5 + digits / 3 + other);
}
