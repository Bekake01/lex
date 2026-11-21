import type { Clause } from '../law.types.js';

/**
 * Splits a contract into clauses.
 *
 * A clause starts at a line that opens with a clause number:
 * - decimal: `1.`, `1.1.`, `2.3`, `4.2)`, `1)` (bare `1)` only when the
 *   document uses no other numbering, since it usually marks list items)
 * - Roman section numbers: `I.`, `II.`, `XIV.`
 * - words: `5-band`, `7-modda`, `Modda 7`, `2-bob`, `1-ilova`,
 *   `Статья 7`, `Пункт 3`, `Глава 2`, `Раздел 1`, `Приложение 1`,
 *   and Uzbek Cyrillic `7-модда`, `5-банд`
 * Text before the first clause becomes a `preamble` clause (title, parties).
 * Without any numbering it falls back to paragraphs (`p1`, `p2`, …).
 *
 * Every clause satisfies `text.slice(clause.start, clause.end) === clause.text`:
 * the clause runs from its number to the last non-space character before the
 * next clause. `heading` is the short title on the number's line, if any.
 */

type Style = 'decimal' | 'paren' | 'roman' | 'word';

interface Candidate {
  style: Style;
  ref: string;
  /** Line start: where the clause begins. */
  start: number;
  /** End of the number and its punctuation on that line. */
  labelEnd: number;
  /** First number of a decimal ref (`4` for `4.2`). */
  top?: number;
  /** Levels in a decimal ref (`4.2` → 2). */
  depth?: number;
}

const DECIMAL = /^[ \t]*(\d{1,3}(?:\.\d{1,2}){0,3})(\.|\))?(?=[ \t]+\S)/;
const ROMAN = /^[ \t]*([IVX]{1,5})\.(?=[ \t]+\S)/;
// `(?!\p{L})` instead of `\b`: JavaScript's \b only knows ASCII letters, so
// it never matches after a Cyrillic word.
const WORD =
  /^[ \t]*(?:(\d{1,3})[ \t]*-?[ \t]*(moddasi|modda|bandi|band|bob|boʻlim|bo'lim|ilova|моддаси|модда|банди|банд|боб|бўлим|илова)(?!\p{L})|(Moddasi|Modda|Статья|Пункт|Глава|Раздел|Приложение)[ \t]+(\d{1,3})(?!\d))[ \t]*[.:)]?/iu;

const VALID_ROMAN = /^(?:X{0,3})(?:IX|IV|V?I{0,3})$/;

/** Words that make a following `1.` restart its counting (section boundaries). */
function resetsCounting(c: Candidate): boolean {
  return c.style === 'roman' || (c.style === 'word' && /bob|bo.lim|боб|бўлим|глава|раздел|ilova|илова|приложение/i.test(c.ref));
}

function lineCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const nl = text.indexOf('\n', lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, lineEnd);

    let m: RegExpExecArray | null;
    if ((m = WORD.exec(line))) {
      const label = m[0].trim().replace(/[.:)]$/, '').trim();
      out.push({ style: 'word', ref: label, start: lineStart, labelEnd: lineStart + m[0].length });
    } else if ((m = ROMAN.exec(line)) && VALID_ROMAN.test(m[1])) {
      out.push({ style: 'roman', ref: m[1], start: lineStart, labelEnd: lineStart + m[0].length });
    } else if ((m = DECIMAL.exec(line))) {
      const ref = m[1];
      const depth = ref.split('.').length;
      const punct = m[2];
      // A single number needs `.` or `)` after it ("1." / "1)"); "1.2" may stand alone.
      if (depth > 1 || punct) {
        out.push({
          style: depth === 1 && punct === ')' ? 'paren' : 'decimal',
          ref,
          start: lineStart,
          labelEnd: lineStart + m[0].length,
          top: Number(ref.split('.')[0]),
          depth,
        });
      }
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  return out;
}

/**
 * Keeps the candidates that are really clause numbers, not list items or
 * numbers that happen to start a line: decimal clauses must count up
 * (`1.`, `2.`, `3.`, with `2.1`, `2.2` under `2.`), restarting after a
 * section heading.
 */
function selectClauses(candidates: Candidate[]): Candidate[] {
  const structured = candidates.filter((c) => c.style !== 'paren');
  // Bare "1)" items are clauses only in documents with no other numbering.
  const pool = structured.length > 0 ? structured : candidates;

  const kept: Candidate[] = [];
  let top = 0;
  // After a section heading numbering may restart ("II." then "1.") or
  // continue ("2-bob" then "2.1"); `beforeSection` remembers where it was.
  let beforeSection = 0;
  for (const c of pool) {
    if (c.style === 'roman' || c.style === 'word') {
      kept.push(c);
      if (resetsCounting(c)) {
        beforeSection = Math.max(beforeSection, top);
        top = 0;
      }
      continue;
    }
    const n = c.top!;
    const afterSection = top === 0;
    if (c.depth === 1) {
      if (n === top + 1 || (afterSection && n === beforeSection + 1)) {
        kept.push(c);
        top = n;
      }
      // Otherwise a nested list ("1. 2. 3." inside clause 4): stays in its clause.
    } else if (afterSection || n === top || n === top + 1) {
      // "4.2" under clause 4; also documents numbered only "1.1, 1.2, 2.1…".
      kept.push(c);
      top = n;
    }
  }
  return kept;
}

/** Index of the last non-whitespace character before `end`, plus one. */
function trimEnd(text: string, start: number, end: number): number {
  while (end > start && /\s/.test(text[end - 1])) end--;
  return end;
}

/**
 * The short title on the number's line: "1. Shartnoma predmeti" → "Shartnoma
 * predmeti". A title has text under it, either in the clause itself or as
 * sub-clauses (`1.` followed by `1.1`, or a section heading).
 */
function headingOf(text: string, labelEnd: number, clauseEnd: number, hasChildren: boolean): string | undefined {
  const nl = text.indexOf('\n', labelEnd);
  const lineEnd = nl === -1 || nl > clauseEnd ? clauseEnd : nl;
  const rest = text.slice(labelEnd, lineEnd).trim();
  const hasBody = lineEnd < clauseEnd && text.slice(lineEnd, clauseEnd).trim().length > 0;
  // Short, not a sentence (no closing . ; , and no ':' that opens a list).
  if (!rest || !(hasBody || hasChildren) || rest.length > 120 || /[.;,:]$/.test(rest)) return undefined;
  return rest;
}

/** Whether `next` sits under `c`: "1." → "1.1", or a section heading → anything. */
function isParentOf(c: Candidate, next: Candidate | undefined): boolean {
  if (!next) return false;
  if (resetsCounting(c) || c.style === 'roman') return true;
  return c.style === 'decimal' && next.style === 'decimal' && next.top === c.top && next.depth! > c.depth!;
}

function paragraphs(text: string): Clause[] {
  // Blank-line paragraphs; a text without blank lines is split by line.
  const separator = /\n[ \t]*\n/.test(text) ? /\n[ \t]*\n/g : /\n/g;
  const out: Clause[] = [];
  let from = 0;
  const push = (to: number) => {
    let start = from;
    while (start < to && /\s/.test(text[start])) start++;
    const end = trimEnd(text, start, to);
    if (end > start) out.push({ ref: `p${out.length + 1}`, text: text.slice(start, end), start, end });
  };
  for (const m of text.matchAll(separator)) {
    push(m.index);
    from = m.index + m[0].length;
  }
  push(text.length);
  return out;
}

export function splitClauses(text: string): Clause[] {
  if (!text.trim()) return [];
  const starts = selectClauses(lineCandidates(text));
  if (starts.length === 0) return paragraphs(text);

  const clauses: Clause[] = [];
  const preambleEnd = trimEnd(text, 0, starts[0].start);
  let preambleStart = 0;
  while (preambleStart < preambleEnd && /\s/.test(text[preambleStart])) preambleStart++;
  if (preambleEnd > preambleStart) {
    clauses.push({ ref: 'preamble', text: text.slice(preambleStart, preambleEnd), start: preambleStart, end: preambleEnd });
  }

  starts.forEach((c, i) => {
    let start = c.start;
    while (/[ \t]/.test(text[start])) start++;
    const end = trimEnd(text, start, i + 1 < starts.length ? starts[i + 1].start : text.length);
    const heading = headingOf(text, c.labelEnd, end, isParentOf(c, starts[i + 1]));
    clauses.push({ ref: c.ref, ...(heading ? { heading } : {}), text: text.slice(start, end), start, end });
  });
  return clauses;
}
