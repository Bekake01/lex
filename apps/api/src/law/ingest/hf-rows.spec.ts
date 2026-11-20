import { mapActType, mapRow, mapStatus, searchText, uniqueId, type HfRow } from './hf-rows.js';

const row = (over: Partial<HfRow> = {}): HfRow => ({
  id: '-111189-a535',
  act_group_id: '111189',
  doc_id: '-111189',
  doc_title: 'Oʻzbekiston Respublikasining Fuqarolik kodeksi',
  doc_type: 'code',
  doc_number: '',
  doc_date: '1996-08-29',
  version_date: '2026-03-17',
  status: 'in-force',
  part: '',
  chapter: '34-bob. Mulk ijarasi',
  article_number: '535',
  article_title: 'Mulk ijarasi shartnomasi',
  article_text: "Mulk ijarasi shartnomasi bo'yicha ijaraga beruvchi  haq evaziga mol-mulkni beradi.",
  source_url: 'https://lex.uz/uz/docs/-111189',
  quality_flag: '',
  ...over,
});

describe('mapRow', () => {
  it('maps a clean article row', () => {
    const m = mapRow(row(), '-111189-a535');
    expect(m).toEqual({
      ok: true,
      act: {
        docId: '-111189',
        actGroupId: '111189',
        title: 'Oʻzbekiston Respublikasining Fuqarolik kodeksi',
        actType: 'code',
        docNumber: null,
        docDate: '1996-08-29',
        versionDate: '2026-03-17',
        status: 'in_force',
        language: 'uz-latn',
        sourceUrl: 'https://lex.uz/uz/docs/-111189',
        source: 'hf',
      },
      article: {
        id: '-111189-a535',
        docId: '-111189',
        articleNumber: '535',
        part: null,
        chapter: '34-bob. Mulk ijarasi',
        title: 'Mulk ijarasi shartnomasi',
        text: 'Mulk ijarasi shartnomasi boʻyicha ijaraga beruvchi haq evaziga mol-mulkni beradi.',
        textNorm:
          'mulk ijarasi shartnomasi\nmulk ijarasi shartnomasi boʻyicha ijaraga beruvchi haq evaziga mol-mulkni beradi.',
        chunkIndex: 0,
        nTokens: expect.any(Number) as number,
        qualityFlag: null,
        language: 'uz-latn',
      },
    });
  });

  it('keeps a flat act (no article number or title) with its flag', () => {
    const m = mapRow(
      row({ id: '-5838599-full', article_number: '', article_title: '', quality_flag: 'no-articles' }),
      '-5838599-full',
    );
    expect(m.ok && m.article).toMatchObject({ articleNumber: null, title: null, qualityFlag: 'no-articles' });
  });

  it('keeps parse-uncertain rows with their flag', () => {
    const m = mapRow(row({ quality_flag: 'parse-uncertain' }), 'x');
    expect(m.ok && m.article.qualityFlag).toBe('parse-uncertain');
  });

  it.each([
    ['too-short', row({ quality_flag: 'too-short' })],
    ['empty-text', row({ article_text: '  \n ' })],
    ['missing-id', row({ doc_id: null })],
  ])('skips a %s row', (reason, r) => {
    expect(mapRow(r, 'x')).toEqual({ ok: false, reason });
  });

  it('drops dates that are not ISO', () => {
    const m = mapRow(row({ doc_date: '29.08.1996', version_date: '' }), 'x');
    expect(m.ok && [m.act.docDate, m.act.versionDate]).toEqual([null, null]);
  });

  it('builds a source url when the row has none', () => {
    const m = mapRow(row({ source_url: '' }), 'x');
    expect(m.ok && m.act.sourceUrl).toBe('https://lex.uz/uz/docs/-111189');
  });
});

describe('mapActType', () => {
  it.each([
    ['code', 'code'],
    ['Resolution', 'resolution'],
    ['farmon', 'other'],
    [null, 'other'],
  ])('%s → %s', (input, expected) => {
    expect(mapActType(input)).toBe(expected);
  });
});

describe('mapStatus', () => {
  it.each([
    ['in-force', 'in_force'],
    ['In force', 'in_force'],
    ['repealed', 'repealed'],
    ['', 'unknown'],
    ['something else', 'unknown'],
  ])('%s → %s', (input, expected) => {
    expect(mapStatus(input)).toBe(expected);
  });
});

describe('searchText', () => {
  it('puts the heading before the body, normalized and lowercased', () => {
    expect(searchText("Ijara to'g'risida", 'Matn')).toBe('ijara toʻgʻrisida\nmatn');
  });
  it('is just the body without a heading', () => {
    expect(searchText(null, 'Matn')).toBe('matn');
  });
});

describe('uniqueId', () => {
  it('keeps the first id and suffixes repeats in order', () => {
    const seen = new Map<string, number>();
    expect(['a', 'b', 'a', 'a'].map((id) => uniqueId(seen, id))).toEqual(['a', 'b', 'a-d2', 'a-d3']);
  });
});
