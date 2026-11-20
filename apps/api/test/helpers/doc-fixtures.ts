import JSZip from 'jszip';

/**
 * Real document files built in memory for tests: no binary fixtures in git,
 * and every byte is visible here.
 */

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A minimal but valid DOCX: one `<w:p>` per paragraph. */
export async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r></w:p>`).join('');
  return makeDocxXml(body);
}

/** Placeholder styles part, used to prove that untouched parts survive byte for byte. */
export const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

/** A DOCX whose `<w:body>` is the given raw WordprocessingML (runs, tables, lists…). */
export async function makeDocxXml(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file('word/styles.xml', STYLES_XML);
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * A minimal valid PDF: one page per entry, each line drawn with Helvetica.
 * An empty page list entry (`[]`) gives a page with no text layer, like a scan.
 * Text must be ASCII (the standard Helvetica encoding).
 */
export function makePdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // 1-based object number

  const catalog = add(''); // placeholder, filled in below
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const lines of pages) {
    const ops = lines
      .map((line, i) => `BT /F1 12 Tf 72 ${720 - i * 16} Td (${line.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** Bytes that look like a Windows executable (MZ header, NUL bytes). */
export function makeExe(): Uint8Array {
  const bytes = new Uint8Array(512);
  bytes.set([0x4d, 0x5a, 0x90, 0x00, 0x03]);
  return bytes;
}
