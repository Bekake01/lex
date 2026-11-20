import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { EMBEDDING_DIMENSIONS, lawActs, lawArticles } from '../../src/db/schema/index.js';
import { importHf } from '../../src/law/ingest/hf-import.js';
import { anchorDocIds, CORE_ACTS } from '../../src/law/lexuz/core-acts.js';
import { LexUzFetcher, LexUzNotFoundError } from '../../src/law/lexuz/fetcher.js';
import { importCoreActs } from '../../src/law/lexuz/ingest-core.js';
import { parseLexUzAct } from '../../src/law/lexuz/parser.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { createTestDb } from '../helpers/test-db.js';

const fixture = (name: string) => readFileSync(join('test/law/fixtures/lexuz', `${name}.html`), 'utf8');
const TRADE_SECRET = fixture('trade-secret-2460801');
const OLD_LABOUR = fixture('labour-code-1995-142859');

describe('parseLexUzAct (saved lex.uz pages)', () => {
  it('reads a law: title, type, number, dates, current edition and articles', () => {
    const act = parseLexUzAct(TRADE_SECRET);
    expect(act).toMatchObject({
      title: 'Tijorat siri toʻgʻrisida',
      actType: 'law',
      docNumber: 'O‘RQ-374',
      docDate: '2014-09-11',
      effectiveDate: '2014-09-12',
      versionDate: '2026-03-17',
      status: 'in_force',
      repealedOn: null,
    });
    expect(act.articles.map((a) => a.number)).toEqual(['1', '2', '3', '4', '5']);
    expect(act.articles[2]).toMatchObject({ number: '3', title: 'Asosiy tushunchalar' });
    expect(act.articles[2].text).toContain('tijorat siri — uchinchi shaxslarga');
  });

  it('ignores editions that are not in force yet (future ONDATE links)', () => {
    const future = TRADE_SECRET.replace('</body>', '<a href="/uz/docs/-1?ONDATE=01.01.2099 00">x</a></body>');
    expect(parseLexUzAct(future, { today: '2026-11-21' }).versionDate).toBe('2026-03-17');
    // On a day before the 2026-03-17 edition, the previous edition is current.
    expect(parseLexUzAct(TRADE_SECRET, { today: '2026-01-01' }).versionDate).toBe('2025-05-08');
  });

  it('leaves out the page toolbar and editorial notes', () => {
    const text = parseLexUzAct(TRADE_SECRET).articles.map((a) => a.text).join('\n');
    expect(text).not.toContain('Hujjatga taklif yuborish');
    expect(text).not.toContain('Audioni tinglash');
    expect(text).not.toContain('tahrirga qarang');
  });

  it('marks a repealed code and keeps its parts and chapters', () => {
    const act = parseLexUzAct(OLD_LABOUR);
    expect(act).toMatchObject({ actType: 'code', status: 'repealed', repealedOn: '2023-04-30', effectiveDate: '1996-04-01' });
    expect(act.articles[0]).toMatchObject({ number: '1', part: 'UMUMIY QISM', chapter: 'I BOB. ASOSIY QOIDALAR' });
  });
});

describe('LexUzFetcher', () => {
  function fakeNet(responses: (number | string)[]) {
    const calls: { url: string; at: number; ua: string }[] = [];
    let clock = 0;
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, at: clock, ua: (init.headers as Record<string, string>)['user-agent'] });
      const r = responses.shift() ?? 200;
      return typeof r === 'string' ? new Response(r, { status: 200 }) : new Response('x', { status: r });
    }) as unknown as typeof fetch;
    const sleep = async (ms: number) => {
      clock += ms;
    };
    return { calls, fetchFn, sleep, now: () => clock };
  }

  it('waits the crawl delay between requests and names only the service', async () => {
    const net = fakeNet(['<a/>', '<b/>']);
    const f = new LexUzFetcher({ ...net, delayMs: 20_000 });
    await f.page('-1');
    await f.page('-2');
    expect(net.calls.map((c) => c.at)).toEqual([0, 20_000]);
    expect(net.calls[0].url).toBe('https://lex.uz/uz/docs/-1');
    expect(net.calls[0].ua).toMatch(/^lex-law-index/);
    expect(net.calls[0].ua).not.toMatch(/@/);
  });

  it('serves cached pages without a request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexuz-cache-'));
    try {
      const net = fakeNet(['<page/>']);
      const f = new LexUzFetcher({ ...net, cacheDir: dir });
      expect(await f.page('-5')).toBe('<page/>');
      expect(await new LexUzFetcher({ ...net, cacheDir: dir }).page('-5')).toBe('<page/>');
      expect(net.calls).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retries a 503 with backoff, then succeeds', async () => {
    const net = fakeNet([503, '<ok/>']);
    expect(await new LexUzFetcher({ ...net, delayMs: 1000 }).page('-1')).toBe('<ok/>');
    expect(net.calls).toHaveLength(2);
  });

  it('reports a missing document and stops after repeated failures', async () => {
    await expect(new LexUzFetcher({ ...fakeNet([404]) }).page('-1')).rejects.toBeInstanceOf(LexUzNotFoundError);
    const f = new LexUzFetcher({ ...fakeNet([500, 500, 500]), retries: 0, maxConsecutiveFailures: 3 });
    await expect(f.page('-1')).rejects.toThrow(/failed/);
    await expect(f.page('-2')).rejects.toThrow(/failed/);
    await expect(f.page('-3')).rejects.toThrow(/stopping/);
  });

  it('refuses a malformed document id', () => {
    expect(() => LexUzFetcher.url('../etc')).toThrow(/Invalid/);
  });
});

describe('core acts', () => {
  it('lists each act once and anchors every contract type', () => {
    expect(new Set(CORE_ACTS.map((a) => a.docId)).size).toBe(CORE_ACTS.length);
    for (const t of ['rental', 'employment', 'sale', 'services', 'nda', 'other'] as const) {
      expect(anchorDocIds(t).length).toBeGreaterThan(0);
    }
    expect(anchorDocIds('employment')).toContain('-6257288');
    expect(anchorDocIds('employment')).not.toContain('-142859');
  });
});

describe('importCoreActs (fixtures → PGlite)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let cacheDir: string;
  const pages: Record<string, string> = { '-2460801': TRADE_SECRET, '-142859': OLD_LABOUR };
  const acts = CORE_ACTS.filter((a) => a.docId in pages);
  const fetcherFor = (dir: string) => {
    const fetchFn = (async (url: string) => new Response(pages[url.split('/').pop()!])) as unknown as typeof fetch;
    return new LexUzFetcher({ fetchFn, cacheDir: dir, delayMs: 0 });
  };
  const vec = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    cacheDir = mkdtempSync(join(tmpdir(), 'lexuz-core-'));
    // What the Hugging Face snapshot had: the old code marked in force, a stale extra article.
    await db.insert(lawActs).values([
      { docId: '-2460801', title: 'Tijorat siri toʻgʻrisida', actType: 'law', status: 'in_force', versionDate: '2025-05-08', language: 'uz-latn', sourceUrl: 'x', source: 'hf' },
      { docId: '-142859', title: 'Mehnat kodeksi', actType: 'code', status: 'in_force', language: 'uz-latn', sourceUrl: 'x', source: 'hf' },
    ]);
    const art1 = parseLexUzAct(TRADE_SECRET).articles[0];
    await db.insert(lawArticles).values([
      // Same text as on lex.uz now: its embedding must survive the import.
      { id: '-2460801-a1', docId: '-2460801', articleNumber: '1', title: art1.title, text: art1.text, textNorm: `${art1.title!.toLowerCase()}\n${art1.text.toLowerCase()}`, language: 'uz-latn', embedding: vec },
      { id: '-2460801-a99', docId: '-2460801', articleNumber: '99', text: 'Eskirgan modda.', textNorm: 'eskirgan modda.', language: 'uz-latn' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('replaces the snapshot with the lex.uz edition and records the real status', async () => {
    const results = await importCoreActs(db, fetcherFor(cacheDir), acts);
    expect(results.map((r) => [r.docId, r.outcome, r.status])).toEqual([
      ['-2460801', 'updated', 'in_force'],
      ['-142859', 'updated', 'repealed'],
    ]);
    const [ts] = await db.select().from(lawActs).where(eq(lawActs.docId, '-2460801'));
    expect(ts).toMatchObject({ source: 'lexuz', core: true, statusChecked: true, versionDate: '2026-03-17', sourceUrl: 'https://lex.uz/uz/docs/-2460801' });
    const [old] = await db.select().from(lawActs).where(eq(lawActs.docId, '-142859'));
    expect(old.status).toBe('repealed');

    const ids = (await db.select({ id: lawArticles.id }).from(lawArticles).where(eq(lawArticles.docId, '-2460801'))).map((r) => r.id).sort();
    expect(ids).toEqual(['-2460801-a1', '-2460801-a2', '-2460801-a3', '-2460801-a4', '-2460801-a5']);
  });

  it('keeps the embedding of an article whose text did not change', async () => {
    const [a1] = await db.select().from(lawArticles).where(eq(lawArticles.id, '-2460801-a1'));
    expect(a1.embedding).not.toBeNull();
    const [a2] = await db.select().from(lawArticles).where(eq(lawArticles.id, '-2460801-a2'));
    expect(a2.embedding).toBeNull();
  });

  it('a second run changes nothing and sends no requests (cache)', async () => {
    const fetcher = fetcherFor(cacheDir);
    const results = await importCoreActs(db, fetcher, acts);
    expect(results.map((r) => r.outcome)).toEqual(['unchanged', 'unchanged']);
    expect(fetcher.requests).toBe(0);
  });

  it('a later Hugging Face import does not overwrite lex.uz acts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexuz-hf-'));
    try {
      const file = join(dir, 'articles.parquet');
      const conn = await (await DuckDBInstance.create(':memory:')).connect();
      await conn.run(`COPY (SELECT '-2460801-a1' AS id, '2460801' AS act_group_id, CAST(-2460801 AS BIGINT) AS doc_id,
          'Eski nom' AS doc_title, 'law' AS doc_type, '' AS doc_number, '2014-09-11' AS doc_date, '2025-05-08' AS version_date,
          'in-force' AS status, '' AS part, '' AS chapter, '1' AS article_number, 'Eski sarlavha' AS article_title,
          'Eski matn.' AS article_text, 'x' AS source_url, '' AS quality_flag) TO '${file.replaceAll('\\', '/')}' (FORMAT parquet)`);
      conn.closeSync();
      const report = await importHf(db, file);
      expect(report.skipped['from-lexuz']).toBe(1);
      const [a1] = await db.select().from(lawArticles).where(eq(lawArticles.id, '-2460801-a1'));
      expect(a1.text).not.toBe('Eski matn.');
      const [ts] = await db.select().from(lawActs).where(eq(lawActs.docId, '-2460801'));
      expect(ts.title).toBe('Tijorat siri toʻgʻrisida');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('search skips the repealed code', async () => {
    const hits = await new SearchService(db).search({ queries: ['mehnat munosabatlari'], inForceOnly: true, limit: 10 });
    expect(hits.some((h) => h.articleId.startsWith('-142859-'))).toBe(false);
  });
});

describe('anchor acts in search', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(lawActs).values([
      { docId: '-2460801', title: 'Tijorat siri toʻgʻrisida', actType: 'law', status: 'in_force', language: 'uz-latn', sourceUrl: 'x', source: 'lexuz', core: true },
      { docId: '-9001', title: 'Boshqa qonun', actType: 'law', status: 'in_force', language: 'uz-latn', sourceUrl: 'x', source: 'hf' },
    ]);
    const row = (id: string, docId: string, title: string, text: string) => ({ id, docId, articleNumber: id.split('-a')[1], title, text, textNorm: `${title}\n${text}`.toLowerCase(), language: 'uz-latn' });
    await db.insert(lawArticles).values([
      // Distractors that match the query words more strongly.
      ...Array.from({ length: 12 }, (_, i) => row(`-9001-a${i + 1}`, '-9001', `Maʼlumotlar maxfiyligi ${i + 1}`, 'Maxfiylik majburiyati va maʼlumotlar maxfiyligi taʼminlanadi.')),
      row('-2460801-a3', '-2460801', 'Asosiy tushunchalar', 'Tijorat sirining maxfiyligi — maʼlumotlardan foydalanish rejimi.'),
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('lifts the anchor act for the contract type', async () => {
    const search = new SearchService(db);
    const rank = async (docType?: 'nda' | 'rental') =>
      (await search.search({ queries: ['maʼlumotlar maxfiyligi'], docType, inForceOnly: true, limit: 20 })).findIndex(
        (h) => h.articleId === '-2460801-a3',
      );
    const without = await rank();
    const withNda = await rank('nda');
    expect(without).toBeGreaterThan(3);
    expect(withNda).toBeGreaterThanOrEqual(0);
    expect(withNda).toBeLessThan(without);
    // A contract type whose anchors do not include this act changes nothing.
    expect(await rank('rental')).toBe(without);
  });
});
