import type { Env } from '../../src/config/env.js';
import type { Db } from '../../src/db/db.module.js';
import { EMBEDDING_DIMENSIONS, lawActs, lawArticles } from '../../src/db/schema/index.js';
import { createEmbeddingProvider, EmbeddingService } from '../../src/law/embeddings/embedding.service.js';
import type { EmbedKind, EmbeddingProvider } from '../../src/law/embeddings/embeddings.js';
import { countMissing, embedMissing } from '../../src/law/ingest/embed.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { createTestDb } from '../helpers/test-db.js';

/**
 * A stand-in for Voyage: each topic word points the vector along one axis,
 * so texts about the same topic are close even with no words in common
 * ("maxfiy" ≈ "tijorat siri"), the way real embeddings behave.
 */
class TopicEmbeddings implements EmbeddingProvider {
  readonly name = 'fake:topics';
  readonly maxBatch = 2;
  calls: { kind: EmbedKind; texts: string[] }[] = [];
  failQueries = false;
  private readonly topics: [RegExp, number][] = [
    [/tijorat|maxfiy|sir\b|siri/i, 0],
    [/ijara|kvartira/i, 1],
    [/mehnat|xodim|ishdan/i, 2],
  ];

  async embedBatch(texts: string[], kind: EmbedKind): Promise<number[][]> {
    this.calls.push({ kind, texts });
    if (kind === 'query' && this.failQueries) throw new Error('provider down');
    return texts.map((text) => {
      const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
      v[EMBEDDING_DIMENSIONS - 1] = 0.01; // never an all-zero vector
      for (const [re, axis] of this.topics) if (re.test(text)) v[axis] = 1;
      return v;
    });
  }
}

const env = {} as Env;
const act = (docId: string, title: string, status: 'in_force' | 'repealed' = 'in_force') => ({
  docId,
  title,
  actType: 'law' as const,
  status,
  language: 'uz-latn',
  sourceUrl: `https://lex.uz/uz/docs/${docId}`,
  source: 'hf' as const,
});
const article = (id: string, docId: string, title: string, text: string) => ({
  id,
  docId,
  articleNumber: id.split('-a')[1] ?? null,
  title,
  text,
  textNorm: `${title}\n${text}`.toLowerCase(),
  language: 'uz-latn',
});

describe('hybrid search (keyword + embeddings)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let provider: TopicEmbeddings;
  let embeddings: EmbeddingService;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(lawActs).values([act('-1', 'Tijorat siri toʻgʻrisida'), act('-2', 'Eski qonun', 'repealed'), act('-3', 'Fuqarolik kodeksi')]);
    await db.insert(lawArticles).values([
      article('-1-a3', '-1', 'Asosiy tushunchalar', 'Tijorat siri — mulkdor himoya qiladigan axborot.'),
      article('-2-a1', '-2', 'Maxfiy axborot', 'Maxfiy axborotni oshkor qilish taqiqlanadi.'),
      article('-3-a544', '-3', 'Ijara haqi', 'Ijara haqi oyiga toʻlanadi.'),
      article('-3-a160', '-3', 'Mehnat shartnomasini bekor qilish', 'Xodim ishdan boʻshatilishi mumkin.'),
    ]);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    provider = new TopicEmbeddings();
    embeddings = new EmbeddingService(env, provider);
  });

  describe('embedMissing (pnpm ingest:embed)', () => {
    it('embeds every row once, in provider-sized batches, and is resumable', async () => {
      expect(await countMissing(db)).toBe(4);
      const first = await embedMissing(db, embeddings);
      expect(first.embedded).toBe(4);
      expect(first.requests).toBe(2); // maxBatch 2
      expect(provider.calls.every((c) => c.kind === 'document')).toBe(true);
      // The act title is part of what is embedded.
      expect(provider.calls.flatMap((c) => c.texts)).toContain(
        'Tijorat siri toʻgʻrisida\nAsosiy tushunchalar\nTijorat siri — mulkdor himoya qiladigan axborot.',
      );
      expect(await countMissing(db)).toBe(0);

      const second = await embedMissing(db, embeddings);
      expect(second.embedded).toBe(0);
    });
  });

  describe('search', () => {
    beforeAll(async () => {
      if ((await countMissing(db)) > 0) await embedMissing(db, new EmbeddingService(env, new TopicEmbeddings()));
    });

    const run = (service: SearchService, query: string, inForceOnly = true) =>
      service.search({ queries: [query], inForceOnly, limit: 10 }).then((hits) => hits.map((h) => h.articleId));

    it('finds a paraphrase keyword search cannot (no words in common)', async () => {
      const query = 'maxfiy maʼlumotni oshkor qilish';
      expect(await run(new SearchService(db), query)).not.toContain('-1-a3');
      // Top 2, not necessarily 1st: on a 4-row database the vector side lists
      // every row, so a weak keyword match on "qilish" can edge ahead. Fusion
      // weights are tuned on the real corpus in Phase 10.
      expect((await run(new SearchService(db, embeddings), query)).slice(0, 2)).toContain('-1-a3');
    });

    it('keeps repealed acts out of the vector side too', async () => {
      const hits = await run(new SearchService(db, embeddings), 'maxfiy maʼlumotni oshkor qilish');
      expect(hits).not.toContain('-2-a1');
      expect(await run(new SearchService(db, embeddings), 'maxfiy maʼlumotni oshkor qilish', false)).toContain('-2-a1');
    });

    it('still ranks a plain keyword match first', async () => {
      expect((await run(new SearchService(db, embeddings), 'ijara haqi'))[0]).toBe('-3-a544');
    });

    it('embeds a Cyrillic query in Latin', async () => {
      await run(new SearchService(db, embeddings), 'Меҳнат шартномасини бекор қилиш');
      const queryTexts = provider.calls.filter((c) => c.kind === 'query').flatMap((c) => c.texts);
      expect(queryTexts).toEqual(['mehnat shartnomasini bekor qilish']);
    });

    it('caches query embeddings', async () => {
      const service = new SearchService(db, embeddings);
      await run(service, 'ijara haqi');
      await run(service, 'ijara haqi');
      expect(provider.calls.filter((c) => c.kind === 'query')).toHaveLength(1);
    });

    it('falls back to keyword results when the provider fails', async () => {
      provider.failQueries = true;
      expect(await run(new SearchService(db, embeddings), 'ijara haqi')).toEqual(['-3-a544']);
    });

    it('is keyword-only when embeddings are not configured', async () => {
      const off = new EmbeddingService(env, null);
      expect(off.enabled).toBe(false);
      expect(await run(new SearchService(db, off), 'ijara haqi')).toEqual(['-3-a544']);
    });
  });
});

describe('createEmbeddingProvider', () => {
  it('uses Voyage when a key is set, bge-m3 when chosen with a URL, and nothing otherwise', () => {
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: 'k' } as Env)?.name).toBe('voyage:voyage-3.5');
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage' } as Env)).toBeNull();
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'bge-m3', EMBEDDING_URL: 'http://x:8080' } as Env)?.name).toBe('bge-m3:tei');
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'bge-m3' } as Env)).toBeNull();
  });
});
