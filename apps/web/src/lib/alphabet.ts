// New Uzbek Latin alphabet (law OʻRQ-1184, 2026): sh→ş, ch→ç, oʻ→ö, gʻ→ğ, ng stays n+g; tutuq belgisi ʼ.
// UI text is written in the new alphabet. Users may still type the old one, so input is
// converted before keyword matching.

const APOS = "['‘’ʻʼ`]";

export function toNewAlphabet(text: string): string {
  return text
    .replace(new RegExp(`([oO])${APOS}`, 'g'), (_, o: string) => (o === 'o' ? 'ö' : 'Ö'))
    .replace(new RegExp(`([gG])${APOS}`, 'g'), (_, g: string) => (g === 'g' ? 'ğ' : 'Ğ'))
    .replace(/SH|Sh|sh/g, (m) => (m === 'sh' ? 'ş' : 'Ş'))
    .replace(/CH|Ch|ch/g, (m) => (m === 'ch' ? 'ç' : 'Ç'))
    .replace(new RegExp(`(?<=\\p{L})${APOS}(?=\\p{L})`, 'gu'), 'ʼ');
}
