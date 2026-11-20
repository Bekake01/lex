import { asc } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { lawActs, lawArticles } from '../../src/db/schema/index.js';
import { chunkExisting, largestRowTokens } from '../../src/law/ingest/chunk-existing.js';
import { countTokens } from '../../src/law/text/index.js';
import { createTestDb } from '../helpers/test-db.js';

const SENTENCE = 'Ijarachi ijara haqini shartnomada belgilangan muddatlarda oʻz vaqtida toʻlashi shart.';
const long = Array.from({ length: 150 }, (_, i) => `${i + 1}) ${SENTENCE}`).join(' ');

describe('chunkExisting', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(lawActs).values({
      docId: '-1', title: 'Kodeks', actType: 'code', language: 'uz-latn', sourceUrl: 'https://lex.uz/uz/docs/-1', source: 'hf',
    });
    await db.insert(lawArticles).values([
      { id: '-1-a1', docId: '-1', articleNumber: '1', title: 'Qisqa', text: SENTENCE, textNorm: 'x', nTokens: countTokens(SENTENCE), language: 'uz-latn' },
      { id: '-1-a2', docId: '-1', articleNumber: '2', title: 'Uzun modda', text: long, textNorm: 'x', nTokens: countTokens(long), language: 'uz-latn' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('replaces only the oversized row with its parts', async () => {
    expect(await largestRowTokens(db)).toBeGreaterThan(1500);

    const report = await chunkExisting(db, { batchSize: 1 });
    expect(report).toMatchObject({ checked: 1, split: 1 });

    const ids = (await db.select({ id: lawArticles.id }).from(lawArticles).orderBy(asc(lawArticles.id))).map((r) => r.id);
    expect(ids[0]).toBe('-1-a1');
    expect(ids).not.toContain('-1-a2');
    expect(ids.slice(1)).toHaveLength(report.parts);
    expect(ids.slice(1).every((id) => id.startsWith('-1-a2-p'))).toBe(true);
    expect(await largestRowTokens(db)).toBeLessThanOrEqual(1200);
  });

  it('a second run splits nothing', async () => {
    expect(await chunkExisting(db)).toMatchObject({ checked: 0, split: 0, parts: 0 });
  });
});
