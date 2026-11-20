import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { LawArticleHit } from '../../src/law/law.types.js';
import type { Db } from '../../src/db/db.module.js';
import { lawActs, lawArticles, lawSyncRuns, type NewLawArticle } from '../../src/db/schema/index.js';
import { searchText } from '../../src/law/ingest/hf-rows.js';
import { MAX_HIT_TEXT } from '../../src/law/search/search.service.js';
import { createTestDb } from '../helpers/test-db.js';

process.env.NODE_ENV = 'test';
// Never connected to: the DB provider is replaced with PGlite below.
process.env.DATABASE_URL = 'postgres://lex:lex@localhost:5434/lex';
process.env.JWT_SECRET ??= 'e2e-test-secret-at-least-32-characters-long';
process.env.REDIS_URL ??= 'redis://localhost:6379';

const { AppModule } = await import('../../src/app.module.js');
const { DB } = await import('../../src/db/db.module.js');

const article = (id: string, docId: string, title: string | null, text: string): NewLawArticle => ({
  id,
  docId,
  title,
  text,
  textNorm: searchText(title, text),
  articleNumber: id.split('-a')[1] ?? null,
  language: 'uz-latn',
});

// The first request warms PGlite and Nest, which can take a few seconds.
describe('search routes (e2e)', { timeout: 20_000 }, () => {
  let app: INestApplication<Server>;
  let db: Db;
  let closeDb: () => Promise<void>;
  const post = (path: string, body: unknown) =>
    request(app.getHttpServer()).post(path).send(body as object);

  beforeAll(async () => {
    ({ db, close: closeDb } = await createTestDb());
    await db.insert(lawActs).values([
      { docId: '-180552', title: 'OʻZBEKISTON RESPUBLIKASINING FUQAROLIK KODEKSI', actType: 'code', versionDate: '2026-03-17', status: 'in_force', core: true, language: 'uz-latn', sourceUrl: 'https://lex.uz/uz/docs/-180552', source: 'hf' },
      { docId: '-900', title: 'Mehnat kodeksi', actType: 'code', versionDate: '2025-05-01', status: 'in_force', language: 'uz-latn', sourceUrl: 'https://lex.uz/uz/docs/-900', source: 'hf' },
      { docId: '-777', title: 'Eski ijara qonuni', actType: 'law', versionDate: '1998-01-01', status: 'repealed', language: 'uz-latn', sourceUrl: 'https://lex.uz/uz/docs/-777', source: 'hf' },
    ]);
    await db.insert(lawArticles).values([
      article('-180552-a535', '-180552', 'Mulk ijarasi shartnomasi', 'Mulk ijarasi shartnomasi boʻyicha ijaraga beruvchi haq evaziga mol-mulkni ijaraga oluvchiga vaqtincha egallash va foydalanish uchun berish majburiyatini oladi.'),
      article('-180552-a551', '-180552', 'Ijaraga beruvchining talabi boʻyicha mulk ijarasi shartnomasini muddatidan oldin bekor qilish', 'Ijaraga oluvchi ijara haqini ikki martadan ortiq toʻlamaganda shartnoma sud tartibida bekor qilinishi mumkin.'),
      article('-900-a100', '-900', 'Mehnat shartnomasini bekor qilish', 'Mehnat shartnomasi xodimning tashabbusi bilan bekor qilinishi mumkin.'),
      article('-777-a1', '-777', 'Ijara shartnomasini bekor qilish', 'Bu qonun ijara shartnomasini bekor qilish tartibini belgilaydi.'),
      article('-180552-a999', '-180552', 'Juda uzun modda', 'soʻz '.repeat(5000)),
    ]);
    await db.insert(lawSyncRuns).values({ status: 'ok', finishedAt: new Date('2026-11-01T03:00:00Z') });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  describe('POST /law/search', () => {
    it('ranks the rental termination article first', async () => {
      const res = await post('/law/search', { queries: ['ijara shartnomasini bekor qilish'] }).expect(200);
      const hits = res.body.hits as LawArticleHit[];
      expect(hits[0]).toMatchObject({
        articleId: '-180552-a551',
        actTitle: 'OʻZBEKISTON RESPUBLIKASINING FUQAROLIK KODEKSI',
        actType: 'code',
        articleNumber: '551',
        sourceUrl: 'https://lex.uz/uz/docs/-180552',
        versionDate: '2026-03-17',
        core: true,
      });
      expect(hits[0].score).toBeGreaterThan(0);
      expect(Object.keys(hits[0]).sort()).toEqual(
        ['actTitle', 'actType', 'articleId', 'articleNumber', 'core', 'score', 'sourceUrl', 'text', 'versionDate'],
      );
    });

    it('leaves out repealed acts by default and includes them on request', async () => {
      const ids = async (inForceOnly?: boolean) =>
        ((await post('/law/search', { queries: ['ijara shartnomasini bekor qilish'], inForceOnly }).expect(200))
          .body.hits as LawArticleHit[]).map((h) => h.articleId);
      expect(await ids()).not.toContain('-777-a1');
      expect(await ids(false)).toContain('-777-a1');
    });

    it('treats an Uzbek Cyrillic query like the same query in Latin', async () => {
      const ids = async (q: string) =>
        ((await post('/law/search', { queries: [q] }).expect(200)).body.hits as LawArticleHit[]).map((h) => h.articleId);
      const cyrillic = await ids('мулк ижараси шартномаси');
      expect(cyrillic).toEqual(await ids('mulk ijarasi shartnomasi'));
      expect(cyrillic).toContain('-180552-a535');
    });

    it('fuses several queries and respects limit', async () => {
      const res = await post('/law/search', {
        queries: ['ijara shartnomasi', 'mehnat shartnomasini bekor qilish'],
        limit: 2,
        docType: 'rental',
      }).expect(200);
      expect(res.body.hits).toHaveLength(2);
    });

    it('caps very long article text', async () => {
      const res = await post('/law/search', { queries: ['juda uzun modda'] }).expect(200);
      const long = (res.body.hits as LawArticleHit[]).find((h) => h.articleId === '-180552-a999');
      expect(long?.text.length).toBe(MAX_HIT_TEXT + 1);
      expect(long?.text.endsWith('…')).toBe(true);
    });

    it('returns no hits for a query of only stopwords', async () => {
      await post('/law/search', { queries: ['va yoki bilan'] }).expect(200, { hits: [] });
    });

    it.each([
      ['no queries', {}],
      ['empty list', { queries: [] }],
      ['blank query', { queries: ['  '] }],
      ['too many queries', { queries: Array.from({ length: 21 }, () => 'ijara') }],
      ['limit over 100', { queries: ['ijara'], limit: 101 }],
      ['unknown docType', { queries: ['ijara'], docType: 'lease' }],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await post('/law/search', body).expect(400);
      expect(res.body.error).toBe('VALIDATION');
    });
  });

  describe('POST /law/articles/batch', () => {
    it('returns articles in the order asked and skips unknown ids', async () => {
      const res = await post('/law/articles/batch', { ids: ['-900-a100', 'nope', '-180552-a535'] }).expect(200);
      expect((res.body.articles as LawArticleHit[]).map((a) => a.articleId)).toEqual(['-900-a100', '-180552-a535']);
    });

    it('rejects an empty id list', async () => {
      await post('/law/articles/batch', { ids: [] }).expect(400);
    });
  });

  describe('GET /law/meta', () => {
    it('reports index size and freshness', async () => {
      const res = await request(app.getHttpServer()).get('/law/meta').expect(200);
      expect(res.body).toEqual({
        indexVersionDate: '2026-03-17',
        acts: 3,
        articles: 5,
        coreActs: 1,
        lastSyncAt: '2026-11-01T03:00:00.000Z',
      });
    });
  });
});
