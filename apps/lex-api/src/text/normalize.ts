/** U+02BB, the official letter mark in oʻ and gʻ. */
export const OKINA = 'ʻ';
/** U+02BC, the official separator (tutuq belgisi), as in maʼlumot. */
export const TUTUQ = 'ʼ';

/** Every character Uzbek texts use for oʻ/gʻ or the separator. */
const APOS = "['‘’`´ʻʼʹʽ]";

const OG_BEFORE_LETTER = new RegExp(`([OoGg])${APOS}(?=\\p{L})`, 'gu');
const OG_WORD_FINAL = new RegExp(`(?<=\\p{L})([OoGg])${APOS}(?!\\p{L})`, 'gu');
const SEPARATOR = new RegExp(`(?<=\\p{L})(?<![OoGg])${APOS}(?=\\p{L})`, 'gu');

export interface NormalizeOptions {
  /** Lowercase the result (the search form). Default false. */
  lowercase?: boolean;
}

/**
 * Normalizes Uzbek Latin text so the same word always has the same bytes:
 * - `o' o‘ o’ o\`` (and g) → `oʻ`/`gʻ`, inside words and at word end (bogʻ)
 * - any other apostrophe between two letters → the separator `ʼ` (maʼlumot)
 * - quotes that aren't inside a word are left alone
 * - zero-width characters and soft hyphens removed, spaces collapsed,
 *   line breaks kept as single `\n`
 *
 * Does not change the script: run cyrillicToLatinUz() first for Cyrillic.
 */
export function normalizeUz(text: string, options: NormalizeOptions = {}): string {
  let s = text
    .normalize('NFC')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\v\f   -   　]/g, ' ');

  s = s
    .replace(OG_BEFORE_LETTER, `$1${OKINA}`)
    .replace(OG_WORD_FINAL, `$1${OKINA}`)
    .replace(SEPARATOR, TUTUQ);

  s = s
    .replace(/ *\n[ \n]*/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();

  return options.lowercase ? s.toLowerCase() : s;
}
