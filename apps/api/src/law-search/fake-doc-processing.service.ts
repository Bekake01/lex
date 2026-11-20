import { Injectable } from '@nestjs/common';
import {
  type ApplyEdit,
  type Clause,
  type DocProcessingService,
  type ExtractedDoc,
} from './law-search.types.js';

/**
 * Stands in for `extractText` / `applyEdits` until document extraction is
 * built (law plan, `docs/law-build-plan.md`).
 *
 * - plain text / markdown: split into clauses here.
 * - PDF: reported as `scanned`, which makes the review send the PDF to Claude
 *   as a native document block instead of text.
 * - DOCX: not supported yet — the job fails with a clear message.
 */
@Injectable()
export class FakeDocProcessingService implements DocProcessingService {
  async extractText(
    bytes: Uint8Array,
    contentType: string,
  ): Promise<ExtractedDoc> {
    if (contentType === 'application/pdf') {
      return { text: '', language: 'mixed', scanned: true, clauses: [] };
    }
    if (!contentType.startsWith('text/')) {
      throw new Error(
        'Document extraction for this file type is not built yet (text and PDF only)',
      );
    }
    const text = new TextDecoder().decode(bytes);
    return {
      text,
      language: 'uz-latn',
      scanned: false,
      clauses: splitClauses(text),
    };
  }

  async applyEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
    void docx;
    void edits;
    throw new Error(
      'Applying edits to DOCX is not built yet',
    );
  }
}

/**
 * Numbered-clause splitter: a line starting with `1.` / `2.3.` / `Modda 4`
 * opens a new clause. Good enough for fixtures and the eval set.
 */
export function splitClauses(text: string): Clause[] {
  const pattern =
    /^[ \t]*(?:(\d+(?:\.\d+)*)\.?|(?:Modda|Moddasi|Статья)\s+(\d+))[ \t.)-]*/gim;
  const starts: { ref: string; index: number; headerEnd: number }[] = [];

  for (const match of text.matchAll(pattern)) {
    const ref = match[1] ?? match[2];
    if (!ref || match.index === undefined) continue;
    starts.push({
      ref,
      index: match.index,
      headerEnd: match.index + match[0].length,
    });
  }

  if (starts.length === 0) {
    return text.trim()
      ? [{ ref: '1', text: text.trim(), start: 0, end: text.length }]
      : [];
  }

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    return {
      ref: start.ref,
      text: text.slice(start.headerEnd, end).trim(),
      start: start.index,
      end,
    };
  });
}
