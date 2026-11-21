'use client';
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Load a PDF with pdf.js from bytes we fetched ourselves: the ticket header
 * has to go along, which pdf.js's own URL loading cannot send. The worker is
 * served from our own origin. `key` reloads when it changes.
 */
export function usePdf(
  key: string | null,
  load: () => Promise<ArrayBuffer>,
): { pdf: PDFDocumentProxy | null; error: string | null } {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    // The loading task owns destroy(); keep it to tear down the worker.
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await load());
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ data });
        task = loadingTask;
        const loaded = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdf(loaded);
      } catch {
        if (!cancelled) setError('Hujjatni oçib bölmadi.');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
    // `load` is a fresh closure on every render; `key` says when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { pdf, error };
}
