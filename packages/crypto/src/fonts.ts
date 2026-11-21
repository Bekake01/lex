import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

/**
 * Noto Sans (SIL OFL 1.1, `fonts/OFL.txt`): Latin, Uzbek Latin (ş ç ğ ö ʻ ʼ)
 * and Cyrillic all print as themselves, unlike the WinAnsi standard fonts.
 * The bytes are read from disk once and shared by every PDF.
 */
export interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

let cached: FontBytes | undefined;

export function loadFonts(): FontBytes {
  cached ??= {
    regular: readFileSync(new URL('../fonts/NotoSans-Regular.ttf', import.meta.url)),
    bold: readFileSync(new URL('../fonts/NotoSans-Bold.ttf', import.meta.url)),
  };
  return cached;
}

/** Embed both weights into `pdf`, subset to the glyphs actually drawn. */
export async function embedFonts(
  pdf: PDFDocument,
): Promise<{ regular: PDFFont; bold: PDFFont }> {
  const fonts = loadFonts();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    pdf.embedFont(fonts.regular, { subset: true }),
    pdf.embedFont(fonts.bold, { subset: true }),
  ]);
  return { regular, bold };
}
