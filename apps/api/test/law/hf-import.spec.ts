import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { eq, isNull } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { EMBEDDING_DIMENSIONS, lawActs, lawArticles } from '../../src/db/schema/index.js';
import { importHf } from '../../src/law/ingest/hf-import.js';
import { HF_COLUMNS, type HfRow } from '../../src/law/ingest/hf-rows.js';
import { createTestDb } from '../helpers/test-db.js';

type FixtureRow = Omit<HfRow, 'doc_id'> & { doc_id: number };

const base = {
  part: '',
  chapter: '',
  doc_number: '',
  status: 'in-force',
  quality_flag: '',
};

const ROWS: FixtureRow[] = [
  { ...base, id: '-111189-a535', act_group_id: '111189', doc_id: -111189, doc_title: 'Fuqarolik kodeksi', doc_type: 'code', doc_date: '1996-08-29', version_date: '2026-03-17', article_number: '535', article_title: 'Mulk ijarasi shartnomasi', article_text: 'Mulk ijarasi shartnomasi boʻyicha ijaraga beruvchi haq evaziga mol-mulkni beradi.', source_url: 'https://lex.uz/uz/docs/-111189' },
  { ...base, id: '-111189-a536', act_group_id: '111189', doc_id: -111189, doc_title: 'Fuqarolik kodeksi', doc_type: 'code', doc_date: '1996-08-29', version_date: '2026-03-17', article_number: '536', article_title: 'Ijara shartnomasining shakli', article_text: "Bir yildan ortiq muddatga tuzilgan ijara shartnomasi yozma shaklda tuzilishi kerak.", source_url: 'https://lex.uz/uz/docs/-111189' },
  // An amending law: two different quoted articles under the same id.
  { ...base, id: '-100711-full', act_group_id: '100711', doc_id: -100711, doc_title: 'Oʻzgartishlar kiritish toʻgʻrisida', doc_type: 'law', doc_date: '1995-01-01', version_date: '1995-01-01', article_number: '', article_title: '“10-modda.', article_text: 'Ijarachi davlat mulki obyektlarini tasarruf etadi.', source_url: 'https://lex.uz/uz/docs/-100711', quality_flag: 'parse-uncertain' },
  { ...base, id: '-100711-full', act_group_id: '100711', doc_id: -100711, doc_title: 'Oʻzgartishlar kiritish toʻgʻrisida', doc_type: 'law', doc_date: '1995-01-01', version_date: '1995-01-01', article_number: '', article_title: '“11-modda.', article_text: 'Davlat korxonasini jamoa korxonasiga aylantirish.', source_url: 'https://lex.uz/uz/docs/-100711', quality_flag: 'parse-uncertain' },
  { ...base, id: '-5838599-full', act_group_id: '5838599', doc_id: -5838599, doc_title: 'Vazirlar Mahkamasining qarori', doc_type: 'resolution', doc_date: '2022-02-01', version_date: '2022-02-01', article_number: '', article_title: '', article_text: 'Qaror matni.', source_url: 'https://lex.uz/uz/docs/-5838599', quality_flag: 'no-articles' },
  { ...base, id: '-1-a1', act_group_id: '1', doc_id: -1, doc_title: 'Qisqa', doc_type: 'order', doc_date: '2020-01-01', version_date: '2020-01-01', article_number: '1', article_title: '', article_text: 'X.', source_url: 'https://lex.uz/uz/docs/-1', quality_flag: 'too-short' },
];

const sqlString = (v: string) => `'${v.replaceAll("'", "''")}'`;

/** Writes rows to a Parquet file with the dataset's column names and types. */
async function writeParquet(path: string, rows: FixtureRow[]): Promise<void> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  const values = rows
    .map((r) =>
      `(${HF_COLUMNS.map((c) => (c === 'doc_id' ? `CAST(${r.doc_id} AS BIGINT)` : sqlString(r[c] ?? ''))).join(', ')})`,
    )
    .join(',\n');
  await conn.run(
    `COPY (SELECT * FROM (VALUES ${values}) AS t(${HF_COLUMNS.join(', ')})) TO ${sqlString(path)} (FORMAT parquet)`,
  );
  conn.closeSync();
  instance.closeSync();
}

describe('importHf (fixture Parquet → PGlite)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let file: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = mkdtempSync(join(tmpdir(), 'lex-hf-'));
    file = join(dir, 'articles.parquet');
    await writeParquet(file, ROWS);
  }, 60_000);

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('imports acts and articles and reports what it did', async () => {
    const report = await importHf(db, file, { batchSize: 2 });
    expect(report).toMatchObject({
      rows: 6,
      skipped: { 'too-short': 1, 'empty-text': 0, 'missing-id': 0 },
      renamedDuplicateIds: 1,
      acts: { inserted: 3, updated: 0, unchanged: 0 },
      actsByType: { code: 1, law: 1, resolution: 1 },
      articles: { inserted: 5, updated: 0, unchanged: 0 },
    });
    expect(await db.$count(lawActs)).toBe(3);
    expect(await db.$count(lawArticles)).toBe(5);
  });

  it('keeps both rows of a reused id', async () => {
    const rows = await db
      .select({ id: lawArticles.id, title: lawArticles.title })
      .from(lawArticles)
      .where(eq(lawArticles.docId, '-100711'))
      .orderBy(lawArticles.id);
    expect(rows).toEqual([
      { id: '-100711-full', title: '“10-modda.' },
      { id: '-100711-full-d2', title: '“11-modda.' },
    ]);
  });

  it('a second run of the same file changes nothing', async () => {
    const report = await importHf(db, file);
    expect(report.acts).toEqual({ inserted: 0, updated: 0, unchanged: 3 });
    expect(report.articles).toEqual({ inserted: 0, updated: 0, unchanged: 5, removed: 0 });
  });

  it('updates a changed article and clears its embedding', async () => {
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    await db.update(lawArticles).set({ embedding });

    const changed = ROWS.map((r) =>
      r.id === '-111189-a536' ? { ...r, article_text: 'Ijara shartnomasi yozma shaklda tuziladi.' } : r,
    );
    const file2 = join(dir, 'changed.parquet');
    await writeParquet(file2, changed);

    const report = await importHf(db, file2);
    expect(report.articles).toEqual({ inserted: 0, updated: 1, unchanged: 4, removed: 0 });

    const cleared = await db
      .select({ id: lawArticles.id })
      .from(lawArticles)
      .where(isNull(lawArticles.embedding));
    expect(cleared).toEqual([{ id: '-111189-a536' }]);
  });

  it('does not overwrite acts from lex.uz or a status checked against lex.uz', async () => {
    await db
      .update(lawActs)
      .set({ source: 'lexuz', title: 'Fuqarolik kodeksi (lex.uz)' })
      .where(eq(lawActs.docId, '-111189'));
    await db
      .update(lawActs)
      .set({ status: 'repealed', statusChecked: true })
      .where(eq(lawActs.docId, '-5838599'));

    const report = await importHf(db, file);
    expect(report.acts.updated).toBe(0);

    const acts = await db
      .select({ id: lawActs.docId, title: lawActs.title, status: lawActs.status })
      .from(lawActs)
      .orderBy(lawActs.docId);
    expect(acts).toContainEqual({ id: '-111189', title: 'Fuqarolik kodeksi (lex.uz)', status: 'in_force' });
    expect(acts).toContainEqual({ id: '-5838599', title: 'Vazirlar Mahkamasining qarori', status: 'repealed' });
  });
});

describe('importHf splitting long rows', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;

  const SENTENCE = 'Vazirlik ushbu qarorning ijrosini taʼminlash yuzasidan zarur chora-tadbirlarni koʻrsin.';
  const longText = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. ${SENTENCE}`).join(' ');
  const flatAct = (text: string): FixtureRow => ({
    ...base,
    id: '-777-full',
    act_group_id: '777',
    doc_id: -777,
    doc_title: 'Uzun qaror',
    doc_type: 'resolution',
    doc_date: '2024-01-01',
    version_date: '2024-01-01',
    article_number: '',
    article_title: '',
    article_text: text,
    source_url: 'https://lex.uz/uz/docs/-777',
    quality_flag: 'no-articles',
  });

  const importText = async (name: string, text: string) => {
    const file = join(dir, `${name}.parquet`);
    await writeParquet(file, [flatAct(text)]);
    return importHf(db, file);
  };
  const storedIds = async () =>
    (await db.select({ id: lawArticles.id }).from(lawArticles).orderBy(lawArticles.chunkIndex)).map((r) => r.id);

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = mkdtempSync(join(tmpdir(), 'lex-hf-chunk-'));
  }, 60_000);

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores a long flat act as parts under the size limit', async () => {
    const report = await importText('long', longText(120));
    expect(report.split.articles).toBe(1);
    expect(report.articles).toEqual({ inserted: report.split.parts, updated: 0, unchanged: 0, removed: 0 });

    const parts = await db.select().from(lawArticles).orderBy(lawArticles.chunkIndex);
    expect(parts.length).toBe(report.split.parts);
    parts.forEach((p, i) => {
      expect(p).toMatchObject({ id: `-777-full-p${i + 1}`, parentId: '-777-full', chunkIndex: i + 1 });
      expect(p.nTokens).toBeLessThanOrEqual(800);
    });
  });

  it('a second run changes and removes nothing', async () => {
    const before = await storedIds();
    const report = await importText('long-again', longText(120));
    expect(report.articles).toEqual({ inserted: 0, updated: 0, unchanged: before.length, removed: 0 });
    expect(await storedIds()).toEqual(before);
  });

  it('removes the parts when the act becomes short', async () => {
    const partsBefore = (await storedIds()).length;
    const report = await importText('short', 'Qisqa qaror matni.');
    expect(report.articles).toEqual({ inserted: 1, updated: 0, unchanged: 0, removed: partsBefore });
    expect(await storedIds()).toEqual(['-777-full']);
  });

  it('removes the whole row when the act becomes long again', async () => {
    const report = await importText('long-3', longText(120));
    expect(report.articles.removed).toBe(1);
    expect(await storedIds()).not.toContain('-777-full');
    expect((await storedIds()).every((id) => id.startsWith('-777-full-p'))).toBe(true);
  });
});
