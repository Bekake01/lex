import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import type { ExtractedDoc } from '../law.types.js';
import { splitClauses } from './clauses.js';
import { kindOfContentType, sniffDocumentKind, type DocumentKind } from './file-type.js';
import { detectLanguage } from './language.js';

/** Why a file could not be read; safe to show and store (no document text). */
export class DocumentExtractionError extends Error {
  constructor(
    message: string,
    readonly code: 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH' | 'UNREADABLE',
  ) {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

/**
 * Below this many non-space characters per page a PDF counts as scanned:
 * a real text page has hundreds; a scan has none, or only a stamp/page number.
 */
const SCANNED_CHARS_PER_PAGE = 40;

/** Text as the rest of the app sees it: Unix newlines, no NUL, nothing else touched. */
function tidy(text: string): string {
  // Kept otherwise as-is: AI edits must match this text character for character.
  return text.replace(/\r\n?/g, '\n').replaceAll('\u0000', '');
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number; scanned: boolean }> {
  // unpdf/pdf.js may detach the buffer it is given; work on a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractPdfText(pdf, { mergePages: false });
  const pages = text.map((page) => tidy(page).trim());
  const visible = pages.join('').replace(/\s+/g, '').length;
  return {
    text: pages.filter(Boolean).join('\n\n'),
    pageCount: totalPages,
    scanned: visible < SCANNED_CHARS_PER_PAGE * Math.max(1, totalPages),
  };
}

async function docxText(bytes: Uint8Array): Promise<string> {
  // mammoth puts a blank line between paragraphs; tables come out cell by cell.
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return tidy(value).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Reads a contract file in memory: PDF (text layer + page count, `scanned`
 * when there is almost none), DOCX, or UTF-8 text. The declared content type
 * must match what the bytes really are.
 */
export async function extractDocument(bytes: Uint8Array, contentType: string): Promise<ExtractedDoc> {
  const declared = kindOfContentType(contentType);
  const actual = sniffDocumentKind(bytes);
  if (!declared || !actual) {
    throw new DocumentExtractionError('Unsupported file type: upload a PDF, DOCX or plain-text file', 'UNSUPPORTED_TYPE');
  }
  if (declared !== actual) {
    throw new DocumentExtractionError(`The file is a ${actual.toUpperCase()}, not a ${declared.toUpperCase()}`, 'TYPE_MISMATCH');
  }

  let text: string;
  let pageCount: number | undefined;
  let scanned = false;
  try {
    switch (actual satisfies DocumentKind) {
      case 'pdf':
        ({ text, pageCount, scanned } = await pdfText(bytes));
        break;
      case 'docx':
        text = await docxText(bytes);
        break;
      case 'text':
        text = tidy(new TextDecoder().decode(bytes)).trim();
        break;
    }
  } catch {
    // The library's message can quote file content; keep it out.
    throw new DocumentExtractionError(`The ${actual.toUpperCase()} file could not be read; it may be damaged or password-protected`, 'UNREADABLE');
  }

  if (scanned) {
    // No usable text layer: the review sends the PDF itself to the model.
    return { text: '', language: 'mixed', pageCount, scanned: true, clauses: [] };
  }
  return { text, language: detectLanguage(text), pageCount, scanned: false, clauses: splitClauses(text) };
}
