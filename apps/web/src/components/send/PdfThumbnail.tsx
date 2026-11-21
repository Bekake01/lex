'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef } from 'react';

/** A small render of one page, reusing the document the editor already has open. */
export function PdfThumbnail({ pdf, page, width = 200 }: { pdf: PDFDocumentProxy; page: number; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      // Device resolution, so the thumbnail isn't mushy on retina.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = p.getViewport({ scale: (width / base.width) * dpr });
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.aspectRatio = `${base.width} / ${base.height}`;
      await p.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, width]);

  return <canvas ref={ref} className="block w-full bg-surface" aria-label={`${page}-sahifa`} />;
}
