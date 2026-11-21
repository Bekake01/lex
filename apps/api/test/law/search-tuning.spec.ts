import { sql } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { lawActs, lawArticles } from '../../src/db/schema/index.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { createTestDb } from '../helpers/test-db.js';

/** Phase 10: stored headings, focused candidates, definition queries. */

const act = (docId: string, title: string, actType: 'law' | 'code' = 'law') => ({
  docId,
  title,
  actType,
  status: 'in_force' as const,
  language: 'uz-latn',
  sourceUrl: `https://lex.uz/uz/docs/${docId}`,
  source: 'hf' as const,
});
const article = (id: string, docId: string, title: string | null, text: string) => ({
  id,
  docId,
  articleNumber: id.split('-a')[1] ?? null,
  title,
  text,
  textNorm: `${title ?? ''}\n${text}`.toLowerCase(),
  language: 'uz-latn',
});

describe('search tuning (Phase 10)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let search: SearchService;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    search = new SearchService(db);
    await db.insert(lawActs).values([
      act('-10', 'Shaxsga doir maʼlumotlar toʻgʻrisida'),
      act('-11', 'Fuqarolik kodeksi', 'code'),
      act('-12', 'Tijorat siri toʻgʻrisida'),
      act('-13', 'Bank siri toʻgʻrisida'),
      act('-14', 'Davlat boji toʻgʻrisida'),
    ]);
    await db.insert(lawArticles).values([
      article('-10-a5', '-10', 'Asosiy tushunchalar', 'Shaxsga doir maʼlumotlar — jismoniy shaxsga oid axborot.'),
      article('-10-a27', '-10', 'Shaxsga doir maʼlumotlarni berish', 'Maʼlumotlar subyektning roziligi bilan beriladi.'),
      ...[1, 2, 3].map((i) =>
        article(
          `-11-a${100 + i}`,
          '-11',
          `Majburiyatlar ${i}`,
          'Uchinchi shaxslarga maʼlumotlarni berish, shaxsga doir talablar, uchinchi shaxs huquqlari, berish tartibi.',
        ),
      ),
      article('-12-a3', '-12', 'Asosiy tushunchalar', 'Ushbu Qonunda quyidagi asosiy tushunchalar qoʻllaniladi: tijorat siri — axborot.'),
      article('-12-a9', '-12', 'Tijorat sirini himoya qilish', 'Tijorat siri egasi uni himoya qiladi; tijorat siri tushunchasi.'),
      article('-13-a4', '-13', 'Bank siri', 'Bank siri — mijoz haqidagi axborot. Tijorat siri tushunchasi bundan farq qiladi.'),
      article('-14-a1', '-14', null, 'Davlat boji undiriladi.'),
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('stores each row heading: the article title, or the act title for flat acts', async () => {
    const heading = async (id: string) => {
      const result = (await db.execute(
        sql`SELECT heading_tsv::text AS h FROM law_articles WHERE id = ${id}`,
      )) as unknown as { rows: { h: string }[] };
      return result.rows[0]!.h;
    };
    expect(await heading('-12-a9')).toContain("'himoya'");
    expect(await heading('-14-a1')).toContain("'boji'");

    // Renaming a flat act renames its rows' heading.
    await db.execute(sql`UPDATE law_acts SET title = 'Davlat yigʻimi toʻgʻrisida' WHERE doc_id = '-14'`);
    expect(await heading('-14-a1')).toContain("'yigʻimi'");
  });

  it('finds an article whose short heading lacks one query word (pd-02)', async () => {
    const hits = await search.search({
      queries: ['shaxsga doir maʼlumotlarni uchinchi shaxslarga berish'],
      inForceOnly: true,
      limit: 10,
    });
    expect(hits[0]?.articleId).toBe('-10-a27');
  });

  it('answers a definition query with the law’s "Asosiy tushunchalar" article (nda-01)', async () => {
    const hits = await search.search({ queries: ['tijorat siri tushunchasi'], inForceOnly: true, limit: 10 });
    expect(hits[0]?.articleId).toBe('-12-a3');
  });

  it('anchors the personal-data law for every contract type', async () => {
    const hits = await search.search({ queries: ['jismoniy shaxs axborot'], docType: 'rental', inForceOnly: true, limit: 10 });
    expect(hits.map((h) => h.articleId)).toContain('-10-a5');
  });
});
