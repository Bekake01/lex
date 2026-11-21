import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { desc, eq, isNull } from 'drizzle-orm';
import type { Env } from '../../src/config/env.js';
import type { Db } from '../../src/db/db.module.js';
import { EMBEDDING_DIMENSIONS, lawArticles, lawSyncRuns } from '../../src/db/schema/index.js';
import { EmbeddingService } from '../../src/law/embeddings/embedding.service.js';
import type { EmbeddingProvider } from '../../src/law/embeddings/embeddings.js';
import { CORE_ACTS } from '../../src/law/lexuz/core-acts.js';
import { LexUzFetcher } from '../../src/law/lexuz/fetcher.js';
import { importCoreActs } from '../../src/law/lexuz/ingest-core.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { LEXUZ_SYNC_LOCK, withAdvisoryLock, type LockClient } from '../../src/law/sync/advisory-lock.js';
import { runLexUzSync } from '../../src/law/sync/sync.js';
import { LexUzSyncScheduler } from '../../src/law/sync/sync.scheduler.js';
import { createTestDb } from '../helpers/test-db.js';

const ORIGINAL = readFileSync(join('test/law/fixtures/lexuz', 'trade-secret-2460801.html'), 'utf8');
/** The same page after an amendment: new edition date, article 1 reworded. */
const AMENDED = ORIGINAL.replace(
  'Ushbu Qonunning maqsadi tijorat sirini muhofaza qilish',
  'Ushbu Qonunning maqsadi tijorat sirini ishonchli muhofaza qilish',
).replace('</body>', '<a href="/uz/docs/-2460801?ONDATE=10.11.2026 00">tahrir</a></body>');

const ACTS = CORE_ACTS.filter((a) => a.docId === '-2460801');

/** A fetcher serving one page (or an HTTP error) with no delay. */
function fetcher(page: string | number): LexUzFetcher {
  const fetchFn = (async () =>
    typeof page === 'number' ? new Response('x', { status: page }) : new Response(page)) as unknown as typeof fetch;
  return new LexUzFetcher({ fetchFn, delayMs: 0, retries: 0 });
}

class CountingEmbeddings implements EmbeddingProvider {
  readonly name = 'fake';
  readonly maxBatch = 16;
  embedded = 0;
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.embedded += texts.length;
    return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)));
  }
}

const article1 = async (db: Db) =>
  (await db.select({ text: lawArticles.text }).from(lawArticles).where(eq(lawArticles.id, '-2460801-a1')))[0].text;
const lastRun = async (db: Db) => (await db.select().from(lawSyncRuns).orderBy(desc(lawSyncRuns.id)).limit(1))[0];

describe('runLexUzSync (Phase 14)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let provider: CountingEmbeddings;
  let embeddings: EmbeddingService;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    provider = new CountingEmbeddings();
    embeddings = new EmbeddingService({} as Env, provider);
    // The state before tonight's sync: the act as imported, fully embedded.
    await importCoreActs(db, fetcher(ORIGINAL), ACTS);
    await db.update(lawArticles).set({ embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1) });
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('updates an amended act, re-embeds only its changed rows, and records the run', async () => {
    const report = await runLexUzSync(db, { fetcher: fetcher(AMENDED), embeddings, acts: ACTS });
    expect(report).toMatchObject({ status: 'ok', checked: 1, updated: 1, unchanged: 0, failed: [] });
    expect(await article1(db)).toContain('ishonchli muhofaza');

    // Only article 1 changed: one row re-embedded, every row has an embedding again.
    expect(report.embedded).toBe(1);
    expect(provider.embedded).toBe(1);
    expect(await db.$count(lawArticles, isNull(lawArticles.embedding))).toBe(0);

    expect(await lastRun(db)).toMatchObject({ status: 'ok', actsChecked: 1, actsUpdated: 1, error: null });
    const meta = await new SearchService(db).meta();
    expect(meta.indexVersionDate).toBe('2026-11-10');
    expect(meta.lastSyncAt).not.toBeNull();
  });

  it('a second run changes nothing', async () => {
    const report = await runLexUzSync(db, { fetcher: fetcher(AMENDED), embeddings, acts: ACTS });
    expect(report).toMatchObject({ status: 'ok', checked: 1, updated: 0, unchanged: 1, embedded: 0 });
  });

  it('a failed fetch leaves the current version intact and is recorded as failed', async () => {
    const before = await article1(db);
    const lastSyncBefore = (await new SearchService(db).meta()).lastSyncAt;

    const report = await runLexUzSync(db, { fetcher: fetcher(500), embeddings, acts: ACTS });
    expect(report.status).toBe('failed');
    expect(report.failed).toHaveLength(1);
    expect(await article1(db)).toBe(before);

    const run = await lastRun(db);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('-2460801');
    // A failed run does not count as the last successful sync.
    expect((await new SearchService(db).meta()).lastSyncAt).toBe(lastSyncBefore);
  });

  it('a page that no longer parses leaves the current version intact', async () => {
    const before = await article1(db);
    const report = await runLexUzSync(db, { fetcher: fetcher('<html><body>Texnik ishlar</body></html>'), acts: ACTS });
    expect(report.status).toBe('failed');
    expect(await article1(db)).toBe(before);
  });
});

describe('withAdvisoryLock', () => {
  const client = (locked: boolean) => {
    const sql: string[] = [];
    const c: LockClient & { sql: string[] } = {
      sql,
      async query(text: string) {
        sql.push(text);
        return { rows: [{ locked }] };
      },
    };
    return c;
  };

  it('runs the job and releases the lock, even when the job fails', async () => {
    const c = client(true);
    await expect(withAdvisoryLock(c, LEXUZ_SYNC_LOCK, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(c.sql).toEqual(['SELECT pg_try_advisory_lock($1) AS locked', 'SELECT pg_advisory_unlock($1)']);
  });

  it('skips the job when another instance holds the lock', async () => {
    let ran = false;
    const result = await withAdvisoryLock(client(false), LEXUZ_SYNC_LOCK, async () => {
      ran = true;
      return 1;
    });
    expect(result).toBeNull();
    expect(ran).toBe(false);
  });
});

describe('LexUzSyncScheduler', () => {
  it('does nothing at night unless SYNC_ENABLED=true', async () => {
    const off = new LexUzSyncScheduler({ SYNC_ENABLED: false } as Env, {} as Db, {} as EmbeddingService);
    const spy = vi.spyOn(off, 'runLocked');
    await off.nightly();
    expect(spy).not.toHaveBeenCalled();

    const on = new LexUzSyncScheduler({ SYNC_ENABLED: true } as Env, {} as Db, {} as EmbeddingService);
    const onSpy = vi.spyOn(on, 'runLocked').mockResolvedValue(null);
    await on.nightly();
    expect(onSpy).toHaveBeenCalledTimes(1);
  });

  it('never throws out of the nightly job', async () => {
    const on = new LexUzSyncScheduler({ SYNC_ENABLED: true } as Env, {} as Db, {} as EmbeddingService);
    vi.spyOn(on, 'runLocked').mockRejectedValue(new Error('db down'));
    await expect(on.nightly()).resolves.toBeUndefined();
  });
});
