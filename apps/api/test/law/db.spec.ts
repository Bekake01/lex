import { cosineDistance, eq, sql } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { EMBEDDING_DIMENSIONS, lawActs, lawArticles } from '../../src/db/schema/index.js';
import { createTestDb } from '../helpers/test-db.js';

/** A unit vector along one axis, so cosine distances are easy to predict. */
function axis(i: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));
}

describe('database schema (migrations on PGlite)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    await db.insert(lawActs).values({
      docId: 'act-1',
      title: 'Oʻzbekiston Respublikasining Fuqarolik kodeksi',
      actType: 'code',
      versionDate: '2026-01-15',
      status: 'in_force',
      language: 'uz-latn',
      sourceUrl: 'https://lex.uz/docs/111189',
      source: 'hf',
    });
    await db.insert(lawArticles).values([
      {
        id: 'act-1-a535',
        docId: 'act-1',
        articleNumber: '535',
        text: 'Mulk ijarasi shartnomasi',
        textNorm: 'mulk ijarasi shartnomasi',
        language: 'uz-latn',
        embedding: axis(0),
      },
      {
        id: 'act-1-a536',
        docId: 'act-1',
        articleNumber: '536',
        text: 'Ijara shartnomasining shakli',
        textNorm: 'ijara shartnomasining shakli',
        language: 'uz-latn',
        embedding: axis(1),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('inserts and reads an act with its article', async () => {
    const rows = await db
      .select({ title: lawActs.title, status: lawActs.status, article: lawArticles.articleNumber })
      .from(lawArticles)
      .innerJoin(lawActs, eq(lawActs.docId, lawArticles.docId))
      .where(eq(lawArticles.id, 'act-1-a535'));

    expect(rows).toEqual([
      { title: 'Oʻzbekiston Respublikasining Fuqarolik kodeksi', status: 'in_force', article: '535' },
    ]);
  });

  it('applies column defaults', async () => {
    const [act] = await db.select().from(lawActs).where(eq(lawActs.docId, 'act-1'));
    expect(act).toMatchObject({ core: false, statusChecked: false });
  });

  it('fills tsv from text_norm for keyword search', async () => {
    const rows = await db
      .select({ id: lawArticles.id })
      .from(lawArticles)
      .where(sql`${lawArticles.tsv} @@ plainto_tsquery('simple', 'ijarasi')`);
    expect(rows).toEqual([{ id: 'act-1-a535' }]);
  });

  it('orders by cosine distance on the embedding', async () => {
    const rows = await db
      .select({ id: lawArticles.id })
      .from(lawArticles)
      .orderBy(cosineDistance(lawArticles.embedding, axis(1)))
      .limit(1);
    expect(rows).toEqual([{ id: 'act-1-a536' }]);
  });

  it('rejects an article whose act does not exist', async () => {
    await expect(
      db.insert(lawArticles).values({
        id: 'orphan',
        docId: 'missing-act',
        text: 'x',
        textNorm: 'x',
        language: 'uz-latn',
      }),
    ).rejects.toThrow();
  });

  it('rejects an embedding with the wrong dimensions', async () => {
    await expect(
      db.insert(lawArticles).values({
        id: 'bad-dims',
        docId: 'act-1',
        text: 'x',
        textNorm: 'x',
        language: 'uz-latn',
        embedding: [1, 2, 3],
      }),
    ).rejects.toThrow();
  });

  it('cascades article deletion with the act', async () => {
    await db.delete(lawActs).where(eq(lawActs.docId, 'act-1'));
    const left = await db.select().from(lawArticles);
    expect(left).toEqual([]);
  });
});
