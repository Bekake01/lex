import type { ExtractedClause } from '../db/schema/index.js';

/**
 * Tying a model answer back to the document's own numbering.
 *
 * Extraction gives every clause a `ref` as the document writes it ("4.2",
 * "7-modda", "Статья 7") and the offsets it occupies in the extracted text.
 * The model is shown that list and asked to reuse it, but it still writes
 * "4.2." or "clause 4.2" or a ref that is not in the document at all, so every
 * answer is resolved here before it is saved.
 *
 * Nothing is thrown away: an unresolved ref is kept exactly as the model wrote
 * it, with no offsets, which is how the frontend tells "the document says this"
 * from "the model made this up".
 */

/** "Clause 4.2." and "4.2" are the same ref; "7-modda" keeps its word. */
export function normaliseRef(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/^(clause|section|item|punkt|modda|band|bob|статья|пункт)\s+/u, '')
    .replace(/[\s.)\]]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface ResolvedClause {
  /** The document's own ref when one matched, else the model's own words. */
  ref: string;
  /** Offsets into the extracted text, or null when nothing matched. */
  start: number | null;
  end: number | null;
}

/**
 * The clause a finding belongs to: by ref when the model copied one, else by
 * where its quote sits in the document, else unresolved.
 */
export function resolveClause(
  clauses: ExtractedClause[],
  claimedRef: string,
  quote?: string,
): ResolvedClause {
  const unresolved: ResolvedClause = {
    ref: claimedRef.trim(),
    start: null,
    end: null,
  };
  if (clauses.length === 0) return unresolved;

  const wanted = normaliseRef(claimedRef);
  if (wanted.length > 0) {
    const byRef = clauses.find((c) => normaliseRef(c.ref) === wanted);
    if (byRef) return { ref: byRef.ref, start: byRef.start, end: byRef.end };
  }

  // Observed on a real run: the model copies the whole outline line, heading
  // and all ("2.3 — Ijaraga beruvchi ijara haqini…"). The ref is the first
  // token, so try that before giving up on the number.
  const head = normaliseRef(claimedRef.split(/[\u2014\u2013—–:|]|\s[-]\s/u)[0]);
  if (head.length > 0 && head !== wanted) {
    const byHead = clauses.find((c) => normaliseRef(c.ref) === head);
    if (byHead) {
      return { ref: byHead.ref, start: byHead.start, end: byHead.end };
    }
  }

  // The model invented the number but quoted the document, which happens most
  // often with unnumbered paragraphs: trust the quote over the number.
  const needle = quote?.trim();
  if (needle && needle.length >= 12) {
    const byQuote = clauses.find((c) => c.text.includes(needle));
    if (byQuote) {
      return { ref: byQuote.ref, start: byQuote.start, end: byQuote.end };
    }
  }

  return unresolved;
}

/**
 * The clause list for the prompt: the document's own refs and headings, so the
 * model answers in the document's numbering instead of inventing one.
 *
 * Capped, because a long contract can have hundreds of clauses and this block
 * sits in front of the document on every call.
 */
export function clauseOutline(
  clauses: ExtractedClause[],
  limit = 150,
): string[] {
  return clauses
    .slice(0, limit)
    .map((c) =>
      c.heading ? `${c.ref} — ${c.heading.slice(0, 120)}` : `${c.ref}`,
    );
}
