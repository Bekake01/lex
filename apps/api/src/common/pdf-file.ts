import { StreamableFile } from '@nestjs/common';

/**
 * `Content-Disposition` for a file name that may hold Uzbek letters: an ASCII
 * fallback for old clients plus the RFC 5987 UTF-8 name everyone else uses.
 */
export function contentDisposition(
  kind: 'attachment' | 'inline',
  fileName: string,
): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Bytes as a downloadable PDF. */
export function pdfAttachment(
  bytes: Uint8Array,
  fileName: string,
): StreamableFile {
  return new StreamableFile(bytes, {
    type: 'application/pdf',
    disposition: contentDisposition('attachment', fileName),
    length: bytes.byteLength,
  });
}
