import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/db.module.js';
import { lawActs, lawArticles } from '../../src/db/schema/index.js';
import {
  embedAll,
  nearest,
  teiProvider,
  voyageProvider,
  type EmbeddingProvider,
} from '../../src/law/embeddings/embeddings.js';
import { formatReport, parseQueries, runSearchEval, type EvalQuery } from '../../src/law/eval/search-eval.js';
import { importHf } from '../../src/law/ingest/hf-import.js';
import { SearchService } from '../../src/law/search/search.service.js';
import { countTokens } from '../../src/law/text/index.js';
import { createTestDb } from '../helpers/test-db.js';

/**
 * Opt-in: Phase 7 embedding comparison on a sample of ~30 acts.
 *   HF_PARQUET=data/hf/articles.parquet VOYAGE_API_KEY=… pnpm vitest run test/law/embed-eval.full.spec.ts
 *   HF_PARQUET=… EMBEDDING_URL=http://localhost:8080 pnpm vitest run test/law/embed-eval.full.spec.ts   (bge-m3 via TEI)
 *
 * The sample is the acts the queries expect plus the largest other codes and
 * laws (distractors, including the repealed 1995 Labour Code), split exactly
 * like the real import. Vector-only search and keyword search are scored on
 * the same sample. Vectors are cached in data/embed-cache/, so re-runs are free.
 * Reports go to data/eval-embed-<provider>.txt and .json.
 */
const FILE = process.env.HF_PARQUET;
const MINUTES = 60_000;

/** Acts holding the expected articles of eval/search/queries.jsonl. */
const KEY_ACTS = [-180552, -111189, -6257288, -4704, -2460801, -4396419, -112328, -18942, -6213382];
const DISTRACTORS = 21;

interface Item {
  id: string;
  text: string;
}

async function buildSample(db: Db): Promise<void> {
  const file = 'data/embed-sample.parquet';
  if (!existsSync(file)) {
    const conn = await (await DuckDBInstance.create(':memory:')).connect();
    await conn.run(`
      COPY (
        WITH others AS (
          SELECT doc_id FROM read_parquet('${FILE!.replaceAll("'", "''")}')
          WHERE doc_type IN ('code', 'law', 'constitution')
            AND doc_id NOT IN (${KEY_ACTS.join(',')})
            AND doc_title NOT ILIKE '%oʻzgartish%' AND doc_title NOT ILIKE '%oʻzgartirish%'
          GROUP BY doc_id ORDER BY count(*) DESC, doc_id LIMIT ${DISTRACTORS}
        )
        SELECT * FROM read_parquet('${FILE!.replaceAll("'", "''")}')
        WHERE doc_id IN (${KEY_ACTS.join(',')}) OR doc_id IN (SELECT doc_id FROM others)
      ) TO '${file}' (FORMAT parquet)`);
    conn.closeSync();
  }
  await importHf(db, file);
}

/** What gets embedded: act title, article heading and body. */
async function corpus(db: Db): Promise<Item[]> {
  const rows = await db
    .select({ id: lawArticles.id, act: lawActs.title, title: lawArticles.title, text: lawArticles.text })
    .from(lawArticles)
    .innerJoin(lawActs, eq(lawActs.docId, lawArticles.docId));
  return rows.map((r) => ({ id: r.id, text: [r.act, r.title, r.text].filter(Boolean).join('\n') }));
}

/** Embeddings cached by provider and text hash; stored as base64 float32. */
async function embedCached(provider: EmbeddingProvider, items: Item[], kind: 'document' | 'query'): Promise<number[][]> {
  mkdirSync('data/embed-cache', { recursive: true });
  const path = join('data/embed-cache', `${provider.name.replace(/[^\w.-]/g, '_')}-${kind}.json`);
  const cache: Record<string, string> = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const key = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 32);
  const todo = items.filter((it) => !cache[key(it.text)]);
  if (todo.length > 0) {
    const vectors = await embedAll(provider, todo.map((t) => t.text), kind, {
      onProgress: (d, n) => d % 1280 < provider.maxBatch && console.log(`  ${provider.name} ${kind}: ${d}/${n}`),
    });
    todo.forEach((it, i) => (cache[key(it.text)] = Buffer.from(new Float32Array(vectors[i]).buffer).toString('base64')));
    writeFileSync(path, JSON.stringify(cache));
  }
  return items.map((it) => {
    const buf = Buffer.from(cache[key(it.text)], 'base64');
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
  });
}

function report(name: string, label: string, r: Awaited<ReturnType<typeof runSearchEval>>, extra: object) {
  const text = formatReport(label, r.summary, r.results);
  writeFileSync(`data/eval-embed-${name}.txt`, `${text}\n\n${JSON.stringify(extra)}\n`);
  writeFileSync(`data/eval-embed-${name}.json`, JSON.stringify({ label, ...extra, summary: r.summary, results: r.results }, null, 2));
  return r.summary;
}

describe.runIf(FILE)('embedding comparison on a ~30-act sample', () => {
  let db: Db;
  let close: () => Promise<void>;
  let items: Item[];
  let queries: EvalQuery[];

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await buildSample(db);
    items = await corpus(db);
    queries = parseQueries(readFileSync('eval/search/queries.jsonl', 'utf8'));
  }, 30 * MINUTES);

  afterAll(async () => {
    await close();
  });

  it('keyword search on the sample', async () => {
    const search = new SearchService(db);
    const r = await runSearchEval(queries, async (q) =>
      (await search.search({ queries: [q.query], docType: q.docType, inForceOnly: true, limit: 30 })).map((h) => h.articleId),
    );
    const s = report('keyword', 'keyword search, ~30-act sample', r, {
      rows: items.length,
      tokens: items.reduce((n, it) => n + countTokens(it.text), 0),
    });
    expect(s.queries).toBe(queries.length);
  }, 30 * MINUTES);

  const providers: [string, () => EmbeddingProvider][] = [
    ['voyage', () => voyageProvider(process.env.VOYAGE_API_KEY!)],
    ['bge-m3', () => teiProvider(process.env.EMBEDDING_URL!)],
  ];
  for (const [name, make] of providers) {
    const enabled = name === 'voyage' ? !!process.env.VOYAGE_API_KEY : !!process.env.EMBEDDING_URL;
    it.runIf(enabled)(`${name}: vector-only search on the sample`, async () => {
      const provider = make();
      const t = Date.now();
      const docVectors = await embedCached(provider, items, 'document');
      const queryVectors = await embedCached(provider, queries.map((q) => ({ id: q.id, text: q.query })), 'query');
      const index = items.map((it, i) => ({ id: it.id, vector: docVectors[i] }));
      const byId = new Map(queries.map((q, i) => [q.id, queryVectors[i]]));
      const r = await runSearchEval(queries, async (q) => nearest(byId.get(q.id)!, index, 30));
      const s = report(name, `${provider.name} vector-only, ~30-act sample`, r, {
        rows: items.length,
        tokens: items.reduce((n, it) => n + countTokens(it.text), 0),
        embedSeconds: Math.round((Date.now() - t) / 1000),
      });
      expect(s.queries).toBe(queries.length);
    }, 120 * MINUTES);
  }
});
