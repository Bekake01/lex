import type { DocumentTextWire, IssueWire, Severity } from '@lex/contracts';

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** One run of text inside a block, with the findings whose `clauseRange` covers it (most severe first). */
export interface Run {
  start: number;
  end: number;
  issues: IssueWire[];
}

/** One clause of the contract (or text between clauses), as runs. */
export interface Block {
  key: string;
  heading: boolean;
  runs: Run[];
}

/**
 * Splits the text into clause blocks (plus any text between clauses), then
 * each block into runs at every finding boundary. Whitespace at a block's
 * edges is dropped so blank lines between clauses don't double up.
 */
export function buildBlocks(doc: DocumentTextWire, issues: IssueWire[]): Block[] {
  const { text } = doc;
  const ranged = issues
    .filter((i) => i.clauseRange && i.clauseRange.end > i.clauseRange.start)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const spans: { start: number; end: number; heading: boolean }[] = [];
  let at = 0;
  for (const c of [...doc.clauses].sort((a, b) => a.start - b.start)) {
    const start = Math.max(c.start, at);
    const end = Math.min(c.end, text.length);
    if (end <= start) continue;
    if (start > at) spans.push({ start: at, end: start, heading: false });
    spans.push({ start, end, heading: Boolean(c.heading) });
    at = end;
  }
  if (at < text.length) spans.push({ start: at, end: text.length, heading: false });

  const blocks: Block[] = [];
  for (const span of spans) {
    let { start, end } = span;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end <= start) continue;

    const cuts = new Set([start, end]);
    for (const i of ranged) {
      const r = i.clauseRange!;
      if (r.start > start && r.start < end) cuts.add(r.start);
      if (r.end > start && r.end < end) cuts.add(r.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const runs: Run[] = [];
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k];
      const b = points[k + 1];
      runs.push({ start: a, end: b, issues: ranged.filter((i) => i.clauseRange!.start < b && i.clauseRange!.end > a) });
    }
    blocks.push({ key: `${start}`, heading: span.heading, runs });
  }
  return blocks;
}

