import { DocumentProcessingService } from '../../src/law/documents/document-processing.service.js';
import { DocumentExtractionError, extractDocument } from '../../src/law/documents/extract.js';
import { DOCX, PDF, sniffDocumentKind } from '../../src/law/documents/file-type.js';
import { detectLanguage } from '../../src/law/documents/language.js';
import { makeDocx, makeExe, makePdf } from '../helpers/doc-fixtures.js';

const UZ_LATN = [
  'TURAR JOY IJARASI SHARTNOMASI',
  '1. Shartnoma predmeti',
  'Ijaraga beruvchi kvartirani ijarachiga vaqtincha foydalanish uchun topshiradi.',
  '2. Ijara haqi',
  'Ijara haqi har oyning 5-sanasigacha toʻlanadi va oʻzgartirilmaydi.',
];
const UZ_CYRL = [
  'ТУРАР ЖОЙ ИЖАРАСИ ШАРТНОМАСИ',
  '1. Шартнома предмети',
  'Ижарага берувчи квартирани ижарачига вақтинча фойдаланиш учун топширади.',
  '2. Ижара ҳақи',
  'Ижара ҳақи ҳар ойнинг 5-санасигача тўланади.',
];
const RU = [
  'ДОГОВОР АРЕНДЫ ЖИЛОГО ПОМЕЩЕНИЯ',
  '1. Предмет договора',
  'Арендодатель передает квартиру арендатору во временное пользование.',
  '2. Арендная плата',
  'Арендная плата вносится до 5 числа каждого месяца.',
];

describe('sniffDocumentKind', () => {
  it('recognises PDF, DOCX and text by their bytes', async () => {
    expect(sniffDocumentKind(makePdf([['x']]))).toBe('pdf');
    expect(sniffDocumentKind(await makeDocx(['x']))).toBe('docx');
    expect(sniffDocumentKind(new TextEncoder().encode('Ijara shartnomasi'))).toBe('text');
  });

  it('rejects an executable, a non-Word ZIP, invalid UTF-8 and an empty file', async () => {
    expect(sniffDocumentKind(makeExe())).toBeNull();
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('notes.txt', 'hello');
    expect(sniffDocumentKind(await zip.generateAsync({ type: 'uint8array' }))).toBeNull();
    expect(sniffDocumentKind(new Uint8Array([0xc3, 0x28, 0x41]))).toBeNull();
    expect(sniffDocumentKind(new Uint8Array())).toBeNull();
  });
});

describe('detectLanguage', () => {
  it.each([
    [UZ_LATN.join('\n'), 'uz-latn'],
    [UZ_CYRL.join('\n'), 'uz-cyrl'],
    [RU.join('\n'), 'ru'],
    ['This Agreement is made between the parties and shall be governed by the laws of the Republic.', 'en'],
    [`${UZ_LATN.join(' ')} ${RU.join(' ')}`, 'mixed'],
  ])('%#: %s…', (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });
});

describe('extractDocument', () => {
  it.each([
    ['Uzbek Latin', UZ_LATN, 'uz-latn'],
    ['Uzbek Cyrillic', UZ_CYRL, 'uz-cyrl'],
    ['Russian', RU, 'ru'],
  ])('reads a %s DOCX with its clauses', async (_name, paragraphs, language) => {
    const doc = await extractDocument(await makeDocx(paragraphs), DOCX);
    expect(doc.scanned).toBe(false);
    expect(doc.language).toBe(language);
    expect(doc.text).toContain(paragraphs[2]);
    expect(doc.clauses.map((c) => c.ref)).toEqual(['preamble', '1', '2']);
    // Offsets point into the returned text.
    for (const c of doc.clauses) expect(doc.text.slice(c.start, c.end)).toContain(c.text);
  });

  it('keeps Uzbek apostrophes exactly as written (edits must match the text)', async () => {
    const doc = await extractDocument(await makeDocx(["Ijara haqi to'lanadi va oʻzgarmaydi."]), DOCX);
    expect(doc.text).toBe("Ijara haqi to'lanadi va oʻzgarmaydi.");
  });

  it('reads a text PDF with its page count', async () => {
    const pdf = makePdf([
      ['TURAR JOY IJARASI SHARTNOMASI', '1. Shartnoma predmeti', 'Ijaraga beruvchi kvartirani ijarachiga topshiradi va ijarachi uni qabul qiladi.'],
      ['2. Ijara haqi', "Ijara haqi har oyning 5-sanasigacha to'lanadi va shartnoma muddatida o'zgartirilmaydi."],
    ]);
    const doc = await extractDocument(pdf, PDF);
    expect(doc).toMatchObject({ pageCount: 2, scanned: false, language: 'uz-latn' });
    expect(doc.text).toContain('Ijaraga beruvchi kvartirani');
    expect(doc.text).toContain('Ijara haqi har oyning');
    expect(doc.clauses.map((c) => c.ref)).toEqual(['preamble', '1', '2']);
  });

  it('marks a PDF without a text layer as scanned', async () => {
    const doc = await extractDocument(makePdf([[], []]), PDF);
    expect(doc).toEqual({ text: '', language: 'mixed', pageCount: 2, scanned: true, clauses: [] });
  });

  it('marks a PDF with only a page number per page as scanned', async () => {
    const doc = await extractDocument(makePdf([['1'], ['2'], ['3']]), PDF);
    expect(doc.scanned).toBe(true);
  });

  it('reads plain text and normalises Windows line endings', async () => {
    const doc = await extractDocument(new TextEncoder().encode('1. Birinchi band\r\n2. Ikkinchi band\r\n'), 'text/plain');
    expect(doc.text).toBe('1. Birinchi band\n2. Ikkinchi band');
    expect(doc.clauses).toHaveLength(2);
  });

  it('refuses an executable renamed to .pdf', async () => {
    await expect(extractDocument(makeExe(), PDF)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('refuses a DOCX sent as a PDF', async () => {
    await expect(extractDocument(await makeDocx(['x']), PDF)).rejects.toMatchObject({ code: 'TYPE_MISMATCH' });
  });

  it('refuses unsupported content types', async () => {
    await expect(extractDocument(new TextEncoder().encode('x'), 'image/png')).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it('reports a damaged PDF without quoting its content', async () => {
    const broken = new TextEncoder().encode('%PDF-1.4\nsecret contract words but no real PDF structure');
    const err = (await extractDocument(broken, PDF).catch((e: unknown) => e)) as DocumentExtractionError;
    expect(err.code).toBe('UNREADABLE');
    expect(err.message).not.toContain('secret');
  });
});

describe('DocumentProcessingService', () => {
  const service = new DocumentProcessingService();

  it('extracts through the shared interface', async () => {
    const doc = await service.extractText(await makeDocx(UZ_LATN), DOCX);
    expect(doc.language).toBe('uz-latn');
  });

  it('applies DOCX edits through the shared interface', async () => {
    const out = await service.applyEdits(await makeDocx(UZ_LATN), [
      { original: '5-sanasigacha', replacement: '10-sanasigacha' },
    ]);
    const doc = await service.extractText(out, DOCX);
    expect(doc.text).toContain('har oyning 10-sanasigacha toʻlanadi');
  });
});
