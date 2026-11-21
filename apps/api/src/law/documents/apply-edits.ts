import JSZip from 'jszip';
import { EditNotFoundError, type ApplyEdit } from '../../law-search/law-search.types.js';

/**
 * Applies text edits to a DOCX while keeping its formatting.
 *
 * Works on `word/document.xml` as text, paragraph by paragraph:
 * - A paragraph's text is its runs' `<w:t>` text, with `<w:tab/>` as "\t" and
 *   `<w:br/>` / `<w:cr/>` as "\n": the same text the extractor (mammoth) returns,
 *   which is where the model copied each `original` from.
 * - `original` must occur exactly once in the document (across all
 *   paragraphs), otherwise `EditNotFoundError(index)`. An `original` that
 *   spans paragraphs (blank lines between them in the extracted text) is
 *   matched across consecutive non-empty paragraphs.
 * - The replacement takes the formatting of the run where the match starts;
 *   runs left empty by the edit are removed.
 * - Only edited paragraphs are rewritten: every other byte of the document,
 *   and every other part of the package, stays as it was.
 */

const DOC_XML = 'word/document.xml';

interface Token {
  kind: 't' | 'tab' | 'br';
  /** Position of the element in the paragraph XML. */
  xmlStart: number;
  xmlEnd: number;
  /** Position of its text in the paragraph text. */
  textStart: number;
  text: string;
}

interface Paragraph {
  /** Position of `<w:p …>…</w:p>` in document.xml. */
  start: number;
  end: number;
  xml: string;
  text: string;
  tokens: Token[];
  /** Inside a table cell: a cell must keep at least one paragraph. */
  inCell: boolean;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text-bearing elements of a paragraph. Deleted text (`w:delText`) and field codes are not matched. */
const TOKEN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g;

function tokenize(xml: string): { text: string; tokens: Token[] } {
  const tokens: Token[] = [];
  let text = '';
  for (const m of xml.matchAll(TOKEN)) {
    const tag = m[0];
    const kind: Token['kind'] = tag.startsWith('<w:tab') ? 'tab' : tag.startsWith('<w:br') || tag.startsWith('<w:cr') ? 'br' : 't';
    const value = kind === 'tab' ? '\t' : kind === 'br' ? '\n' : decode(m[1] ?? '');
    tokens.push({ kind, xmlStart: m.index, xmlEnd: m.index + tag.length, textStart: text.length, text: value });
    text += value;
  }
  return { text, tokens };
}

/** Paragraphs of the body, in order. Nested paragraphs (text boxes) are left alone. */
function paragraphs(doc: string): Paragraph[] {
  const out: Paragraph[] = [];
  const re = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  let depth = 0; // table-cell depth up to the current position
  let scanned = 0;
  for (const m of doc.matchAll(re)) {
    const between = doc.slice(scanned, m.index);
    depth += (between.match(/<w:tc[ >]/g)?.length ?? 0) - (between.match(/<\/w:tc>/g)?.length ?? 0);
    scanned = m.index;
    const xml = m[0];
    // A text box inside a run nests <w:p>; the lazy match would cut it. Skip those paragraphs.
    if (/<w:p[ >]/.test(xml.slice(1))) continue;
    out.push({ start: m.index, end: m.index + xml.length, xml, inCell: depth > 0, ...tokenize(xml) });
  }
  return out;
}

const EMPTIED = '\u0000emptied\u0000';

/**
 * Replaces paragraph text [from, to) with `replacement`, inside the run where
 * `from` falls. Returns the new paragraph XML, or null when the range starts
 * on a tab or line break (no run to carry the replacement).
 */
function replaceInParagraph(p: Paragraph, from: number, to: number, replacement: string): string | null {
  const end = (t: Token) => t.textStart + t.text.length;
  const covers = (t: Token) => end(t) > from && t.textStart < to;
  // The run holding `from`; at a run boundary, the run that ends there.
  let first = p.tokens.findIndex((t) => t.kind === 't' && t.textStart <= from && from < end(t));
  if (first === -1) first = p.tokens.findIndex((t) => t.kind === 't' && end(t) === from);
  if (first === -1) return null;

  // Edit tokens back to front so XML positions stay valid.
  let xml = p.xml;
  for (let i = p.tokens.length - 1; i >= 0; i--) {
    const t = p.tokens[i];
    const inRange = i === first || covers(t);
    if (!inRange) continue;
    let element: string;
    if (i === first) {
      const keep = t.text.slice(0, from - t.textStart);
      const tail = end(t) > to ? t.text.slice(to - t.textStart) : '';
      element = `<w:t xml:space="preserve">${encode(keep + replacement + tail)}</w:t>`;
    } else if (t.kind === 't') {
      const tail = end(t) > to ? t.text.slice(to - t.textStart) : '';
      element = tail ? `<w:t xml:space="preserve">${encode(tail)}</w:t>` : EMPTIED;
    } else {
      element = EMPTIED; // a tab or break inside the replaced range
    }
    xml = xml.slice(0, t.xmlStart) + element + xml.slice(t.xmlEnd);
  }
  // Remove runs this edit emptied: nothing left but their formatting.
  xml = xml.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
    if (!run.includes(EMPTIED)) return run;
    const rest = run
      .replace(/^<w:r(?:\s[^>]*)?>/, '')
      .replace(/<\/w:r>$/, '')
      .replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '')
      .split(EMPTIED)
      .join('');
    return rest.trim() ? run.split(EMPTIED).join('') : '';
  });
  return xml.split(EMPTIED).join('');
}

/** All places `original` occurs: single-paragraph matches, or a run of consecutive paragraphs. */
function findMatches(paras: Paragraph[], original: string): { first: number; last: number; from: number; to: number }[] {
  const matches: { first: number; last: number; from: number; to: number }[] = [];
  const segments = original.split(/\n[ \t]*\n+/);
  if (segments.length === 1) {
    paras.forEach((p, i) => {
      for (let at = p.text.indexOf(original); at !== -1; at = p.text.indexOf(original, at + 1)) {
        matches.push({ first: i, last: i, from: at, to: at + original.length });
      }
    });
    return matches;
  }
  // Across paragraphs: empty paragraphs are skipped, as the extracted text collapses them.
  const nonEmpty = paras.map((p, i) => ({ p, i })).filter(({ p }) => p.text.trim().length > 0);
  for (let k = 0; k + segments.length <= nonEmpty.length; k++) {
    const head = nonEmpty[k].p.text;
    if (!head.endsWith(segments[0])) continue;
    let ok = true;
    for (let s = 1; s < segments.length - 1 && ok; s++) ok = nonEmpty[k + s].p.text === segments[s];
    const tail = nonEmpty[k + segments.length - 1].p.text;
    if (ok && tail.startsWith(segments[segments.length - 1])) {
      matches.push({
        first: nonEmpty[k].i,
        last: nonEmpty[k + segments.length - 1].i,
        from: head.length - segments[0].length,
        to: segments[segments.length - 1].length,
      });
    }
  }
  return matches;
}

/** A copy of paragraph `p` holding only `text`, with its paragraph and first-run formatting. */
function cloneParagraph(p: Paragraph, text: string): string {
  const open = p.xml.match(/^<w:p(?:\s[^>]*)?>/)?.[0] ?? '<w:p>';
  const pPr = p.xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const rPr = p.xml.match(/<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? '';
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${encode(text)}</w:t></w:r></w:p>`;
}

function applyOne(doc: string, edit: ApplyEdit, index: number): string {
  if (!edit.original) throw new EditNotFoundError(index);
  const paras = paragraphs(doc);
  const matches = findMatches(paras, edit.original);
  if (matches.length !== 1) throw new EditNotFoundError(index);
  const { first, last, from, to } = matches[0];

  if (first === last) {
    const p = paras[first];
    const xml = replaceInParagraph(p, from, to, edit.replacement);
    if (xml === null) throw new EditNotFoundError(index);
    return doc.slice(0, p.start) + xml + doc.slice(p.end);
  }

  // Across paragraphs: the first keeps its prefix + the first replacement
  // line, the last keeps its suffix (+ the last line), new lines get new
  // paragraphs, and fully replaced paragraphs in between go away.
  const lines = edit.replacement.split(/\n[ \t]*\n+/);
  const head = paras[first];
  const tail = paras[last];
  const headXml = replaceInParagraph(head, from, head.text.length, lines[0]);
  const tailText = lines.length > 1 ? lines[lines.length - 1] : '';
  const tailXml = replaceInParagraph(tail, 0, to, tailText);
  if (headXml === null || tailXml === null) throw new EditNotFoundError(index);

  const middle = lines.slice(1, lines.length > 1 ? -1 : undefined).map((line) => cloneParagraph(head, line));
  const tailEmpty = tail.text.slice(to).length === 0 && tailText.length === 0;
  const parts: string[] = [headXml, ...middle];
  if (!tailEmpty || tail.inCell) parts.push(tailXml);

  // Paragraphs strictly between first and last are removed, except in table
  // cells (a cell needs one paragraph), where they are emptied instead.
  let out = doc.slice(0, head.start) + parts.join('');
  let cursor = head.end;
  for (let i = first + 1; i <= last; i++) {
    const p = paras[i];
    out += doc.slice(cursor, p.start);
    if (i < last && p.inCell) out += cloneParagraph(p, '');
    cursor = p.end;
  }
  return out + doc.slice(cursor);
}

/** Applies `edits` in order to the DOCX bytes; returns the new DOCX. */
export async function applyDocxEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(docx);
  const part = zip.file(DOC_XML);
  if (!part) throw new Error('Not a Word document: word/document.xml is missing');

  let doc = await part.async('string');
  edits.forEach((edit, index) => {
    doc = applyOne(doc, edit, index);
  });

  zip.file(DOC_XML, doc);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
