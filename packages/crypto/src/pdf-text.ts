/**
 * Making arbitrary text safe to draw into a PDF line.
 *
 * Stamping and the certificate embed Noto Sans, so letters of any script
 * pdf-lib can encode are drawn as they are (a glyph the font lacks prints as an
 * empty box, it never throws). What is left to guard against is layout:
 * control characters are dropped and tabs / newlines flatten to one space,
 * because every value is drawn on a single line.
 */
export function toPdfSafeText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) out += ' ';
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    else if (code >= 0xd800 && code <= 0xdfff) continue; // lone surrogate
    else out += ch;
  }
  return out;
}
