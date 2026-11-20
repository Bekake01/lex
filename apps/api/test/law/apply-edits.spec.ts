import JSZip from 'jszip';
import { EditNotFoundError } from '../../src/law-search/law-search.types.js';
import { applyDocxEdits } from '../../src/law/documents/apply-edits.js';
import { extractDocument } from '../../src/law/documents/extract.js';
import { DOCX } from '../../src/law/documents/file-type.js';
import { makeDocxXml, STYLES_XML } from '../helpers/doc-fixtures.js';

const BOLD = '<w:rPr><w:b/></w:rPr>';
const R = (text: string, rPr = '') => `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const P = (runs: string, pPr = '') => `<w:p>${pPr}${runs}</w:p>`;

async function docXml(docx: Uint8Array): Promise<string> {
  return (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string');
}
async function textOf(docx: Uint8Array): Promise<string> {
  return (await extractDocument(docx, DOCX)).text;
}
/** The `<w:p>` elements of document.xml, as strings. */
const paragraphsOf = (xml: string) => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];

describe('applyDocxEdits', () => {
  it('replaces text split across runs and removes the run it emptied', async () => {
    const docx = await makeDocxXml(P(R('Shartnoma ') + R('bir') + R(' yil') + R(' muddatga tuziladi.')));
    const out = await applyDocxEdits(docx, [{ original: 'bir yil', replacement: 'ikki yil' }]);
    expect(await textOf(out)).toBe('Shartnoma ikki yil muddatga tuziladi.');
    expect((await docXml(out)).match(/<w:r>/g)).toHaveLength(3);
  });

  it('keeps bold when the edit is inside the bold run', async () => {
    const docx = await makeDocxXml(P(R('Ijarachi ') + R('har oyning 5-sanasigacha', BOLD) + R(' toʻlaydi.')));
    const out = await applyDocxEdits(docx, [{ original: '5-sanasigacha', replacement: '10-sanasigacha' }]);
    const xml = await docXml(out);
    expect(await textOf(out)).toBe('Ijarachi har oyning 10-sanasigacha toʻlaydi.');
    expect(xml).toContain(`<w:r>${BOLD}<w:t xml:space="preserve">har oyning 10-sanasigacha</w:t></w:r>`);
  });

  it('gives a replacement that starts before a bold part the first run’s formatting', async () => {
    const docx = await makeDocxXml(P(R('Ijarachi ') + R('har oyning 5-sanasigacha', BOLD) + R(' toʻlaydi.')));
    const out = await applyDocxEdits(docx, [
      { original: 'Ijarachi har oyning 5-sanasigacha', replacement: 'Ijarachi har oyning 10-sanasigacha' },
    ]);
    expect(await textOf(out)).toBe('Ijarachi har oyning 10-sanasigacha toʻlaydi.');
    expect(await docXml(out)).not.toContain('<w:b/>'); // the emptied bold run is gone
  });

  it('edits text inside a table cell and keeps the table', async () => {
    const table =
      '<w:tbl><w:tr>' +
      `<w:tc><w:tcPr/>${P(R('Narx'))}</w:tc>` +
      `<w:tc><w:tcPr/>${P(R('4 500 000 soʻm'))}</w:tc>` +
      '</w:tr></w:tbl>';
    const docx = await makeDocxXml(P(R('Jadval:')) + table);
    const out = await applyDocxEdits(docx, [{ original: '4 500 000 soʻm', replacement: '5 000 000 soʻm' }]);
    const xml = await docXml(out);
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('5 000 000 soʻm');
    expect(xml).not.toContain('4 500 000');
  });

  it('keeps list numbering on an edited list paragraph', async () => {
    const numbered = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr>';
    const docx = await makeDocxXml(P(R('Ijara haqi oyiga toʻlanadi.'), numbered) + P(R('Kvartira taʼmirlanadi.'), numbered));
    const out = await applyDocxEdits(docx, [{ original: 'oyiga', replacement: 'har chorakda' }]);
    const paras = paragraphsOf(await docXml(out));
    expect(paras[0]).toContain('<w:numId w:val="3"/>');
    expect(paras[0]).toContain('har chorakda');
  });

  it('matches Uzbek apostrophes exactly (ʻ is not \')', async () => {
    const docx = await makeDocxXml(P(R('Ijara haqi toʻlanadi va oʻzgarmaydi.')));
    await expect(applyDocxEdits(docx, [{ original: "to'lanadi", replacement: 'x' }])).rejects.toEqual(
      new EditNotFoundError(0),
    );
    const out = await applyDocxEdits(docx, [{ original: 'toʻlanadi', replacement: 'oldindan toʻlanadi' }]);
    expect(await textOf(out)).toBe('Ijara haqi oldindan toʻlanadi va oʻzgarmaydi.');
  });

  it('throws EditNotFoundError with the index of the failing edit (0 or 2+ matches)', async () => {
    const docx = await makeDocxXml(P(R('Ijara haqi oyiga.')) + P(R('Ijara haqi oyiga.')) + P(R('Muddat bir yil.')));
    const missing = await applyDocxEdits(docx, [
      { original: 'Muddat bir yil', replacement: 'Muddat ikki yil' },
      { original: 'yoʻq matn', replacement: 'x' },
    ]).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(EditNotFoundError);
    expect((missing as EditNotFoundError).index).toBe(1);

    const twice = await applyDocxEdits(docx, [{ original: 'Ijara haqi oyiga.', replacement: 'x' }]).catch((e: unknown) => e);
    expect((twice as EditNotFoundError).index).toBe(0);
  });

  it('leaves untouched paragraphs and other parts byte-identical', async () => {
    const before = P(R('Birinchi ') + R('band', BOLD)) + P(R('Ikkinchi band, oʻzgaradi.')) + P(R('Uchinchi band.'));
    const docx = await makeDocxXml(before);
    const out = await applyDocxEdits(docx, [{ original: 'oʻzgaradi', replacement: 'oʻzgartirildi' }]);
    const [p1, , p3] = paragraphsOf(await docXml(out));
    const [o1, , o3] = paragraphsOf(before);
    expect(p1).toBe(o1);
    expect(p3).toBe(o3);
    const styles = await (await JSZip.loadAsync(out)).file('word/styles.xml')!.async('string');
    expect(styles).toBe(STYLES_XML);
  });

  it('escapes XML special characters in the replacement', async () => {
    const docx = await makeDocxXml(P(R('Shartnoma A va B oʻrtasida.')));
    const out = await applyDocxEdits(docx, [{ original: 'A va B', replacement: '"Orzu" MChJ & <Savdo> QK' }]);
    expect(await docXml(out)).toContain('&quot;Orzu&quot;'.replace(/&quot;/g, '"') + ' MChJ &amp; &lt;Savdo&gt; QK');
    expect(await textOf(out)).toBe('Shartnoma "Orzu" MChJ & <Savdo> QK oʻrtasida.');
  });

  it('applies edits in order, each on the result of the previous one', async () => {
    const docx = await makeDocxXml(P(R('Muddat bir yil.')));
    const out = await applyDocxEdits(docx, [
      { original: 'bir yil', replacement: 'ikki yil' },
      { original: 'ikki yil.', replacement: 'ikki yil, uzaytirish mumkin.' },
    ]);
    expect(await textOf(out)).toBe('Muddat ikki yil, uzaytirish mumkin.');
  });

  it('replaces an original that spans two paragraphs', async () => {
    const docx = await makeDocxXml(P(R('1. Predmet.')) + P(R('Ijara bir yilga.')) + P(R('2. Narx.')) + P(R('Oyiga 4 mln.')));
    const out = await applyDocxEdits(docx, [
      { original: 'Ijara bir yilga.\n\n2. Narx.', replacement: 'Ijara ikki yilga.\n\n2. Narx va toʻlov.' },
    ]);
    expect(await textOf(out)).toBe('1. Predmet.\n\nIjara ikki yilga.\n\n2. Narx va toʻlov.\n\nOyiga 4 mln.');
  });

  it('merges spanned paragraphs when the replacement is one paragraph', async () => {
    const docx = await makeDocxXml(P(R('Birinchi.')) + P(R('Ikkinchi.')) + P(R('Uchinchi.')));
    const out = await applyDocxEdits(docx, [{ original: 'Birinchi.\n\nIkkinchi.', replacement: 'Birlashtirilgan.' }]);
    expect(await textOf(out)).toBe('Birlashtirilgan.\n\nUchinchi.');
  });

  it('produces a DOCX the extractor reads again (round trip)', async () => {
    const docx = await makeDocxXml(P(R('1. ') + R('Shartnoma predmeti', BOLD)) + P(R('Ijarachi kvartirani ') + R('saqlaydi.')));
    const out = await applyDocxEdits(docx, [{ original: 'kvartirani saqlaydi', replacement: 'kvartirani ehtiyotkorlik bilan saqlaydi' }]);
    const doc = await extractDocument(out, DOCX);
    expect(doc.text).toBe('1. Shartnoma predmeti\n\nIjarachi kvartirani ehtiyotkorlik bilan saqlaydi.');
    expect(doc.clauses.map((c) => c.ref)).toEqual(['1']);
  });

  it('refuses a file that is not a Word document', async () => {
    const zip = new JSZip();
    zip.file('notes.txt', 'x');
    await expect(applyDocxEdits(await zip.generateAsync({ type: 'uint8array' }), [])).rejects.toThrow(/Not a Word document/);
  });
});
