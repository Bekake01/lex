/**
 * What a contract file really is, judged by its bytes. The `Content-Type`
 * a browser sends is only a claim: a renamed `.exe` arrives as
 * `application/pdf` just as easily.
 */

export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const TEXT = 'text/plain';

export type DocumentKind = 'pdf' | 'docx' | 'text';

const ascii = (s: string) => new TextEncoder().encode(s);

function startsWith(bytes: Uint8Array, prefix: Uint8Array, at = 0): boolean {
  if (bytes.length < at + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[at + i] !== prefix[i]) return false;
  return true;
}

function includes(bytes: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

const PDF_MAGIC = ascii('%PDF-');
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const DOCX_PART = ascii('word/document.xml');

/** The kind of document the bytes hold, or null when it is none we accept. */
export function sniffDocumentKind(bytes: Uint8Array): DocumentKind | null {
  if (bytes.length === 0) return null;
  // The PDF header may follow up to 1 KB of junk (per the PDF spec's tolerance).
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i <= head.length - PDF_MAGIC.length; i++) {
    if (startsWith(head, PDF_MAGIC, i)) return 'pdf';
  }
  // A DOCX is a ZIP whose directory names word/document.xml.
  if (startsWith(bytes, ZIP_MAGIC)) return includes(bytes, DOCX_PART) ? 'docx' : null;
  // Text: valid UTF-8 without NUL bytes (binaries almost always contain NUL).
  if (bytes.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text';
  } catch {
    return null;
  }
}

/** The kind a declared content type stands for, or null when unsupported. */
export function kindOfContentType(contentType: string): DocumentKind | null {
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (base === PDF) return 'pdf';
  if (base === DOCX) return 'docx';
  if (base === 'text/plain' || base === 'text/markdown') return 'text';
  return null;
}
