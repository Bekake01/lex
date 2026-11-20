// One place for the upload rules the UI checks before sending a file.
// Same limits as the API's POST /documents (MAX_UPLOAD_BYTES default 20 MB, PDF / DOCX / text).

export const UPLOAD_ACCEPT = '.pdf,.docx,.txt';
export const UPLOAD_MAX_MB = 20;

/** null = fine, otherwise a message for the user. */
export function uploadError(file: File): string | null {
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return 'Faqat PDF, DOCX yoki TXT fayl yuklang.';
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) return `Fayl juda katta — ${UPLOAD_MAX_MB} MB gaça bölişi kerak.`;
  return null;
}

/** Sending for signature takes PDF only (the review takes PDF / DOCX / TXT). */
export const SEND_ACCEPT = '.pdf';

/** null = fine, otherwise a message for the user. */
export function sendUploadError(file: File): string | null {
  if (!/\.pdf$/i.test(file.name)) {
    return 'Faqat PDF yuboriş mumkin — Word faylni PDF ga aylantirib yuklang (Fayl → PDF sifatida saqlaş).';
  }
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) return `Fayl juda katta — ${UPLOAD_MAX_MB} MB gaça bölişi kerak.`;
  return null;
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
