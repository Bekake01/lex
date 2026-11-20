import { EMBEDDING_DIMENSIONS } from '../../db/schema/law.js';
import {
  cosine,
  embedAll,
  nearest,
  openaiEmbeddingProvider,
  RetryableError,
  teiProvider,
  voyageProvider,
  type EmbeddingProvider,
} from './embeddings.js';

const vec = (x: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? x : 0.001));

function fakeFetch(handler: (url: string, body: any) => { status: number; json?: unknown; headers?: Record<string, string> }) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('voyageProvider', () => {
  it('sends kind, model and 1024 dims, and returns vectors in input order', async () => {
    const { fn, calls } = fakeFetch((_u, body) => ({
      status: 200,
      json: { data: body.input.map((_: string, i: number) => ({ index: i, embedding: vec(i) })).reverse() },
    }));
    const p = voyageProvider('secret-key', { fetchFn: fn });
    const out = await p.embedBatch(['a', 'b'], 'query');
    expect(out.map((v) => v[0])).toEqual([0, 1]);
    expect(calls[0].body).toMatchObject({ model: 'voyage-3.5', input_type: 'query', output_dimension: 1024 });
    expect(calls[0].headers.authorization).toBe('Bearer secret-key');
  });

  it('rejects vectors of the wrong size', async () => {
    const { fn } = fakeFetch(() => ({ status: 200, json: { data: [{ index: 0, embedding: [1, 2, 3] }] } }));
    await expect(voyageProvider('k', { fetchFn: fn }).embedBatch(['a'], 'document')).rejects.toThrow(/1024-d/);
  });

  it('does not put the response body in errors (it can echo input text)', async () => {
    const { fn } = fakeFetch(() => ({ status: 400, json: { detail: 'secret contract text' } }));
    const err = await voyageProvider('k', { fetchFn: fn }).embedBatch(['a'], 'document').catch((e: Error) => e);
    expect(String(err)).toContain('400');
    expect(String(err)).not.toContain('secret contract text');
  });
});

describe('openaiEmbeddingProvider', () => {
  it('asks for 1024 dimensions with the large model and keeps input order', async () => {
    const { fn, calls } = fakeFetch((_u, body) => ({
      status: 200,
      json: { data: body.input.map((_: string, i: number) => ({ index: i, embedding: vec(i) })).reverse() },
    }));
    const out = await openaiEmbeddingProvider('sk-test', { fetchFn: fn }).embedBatch(['a', 'b', 'c'], 'document');
    expect(out.map((v) => v[0])).toEqual([0, 1, 2]);
    expect(calls[0].url).toBe('https://api.openai.com/v1/embeddings');
    expect(calls[0].body).toMatchObject({ model: 'text-embedding-3-large', dimensions: 1024 });
    expect(calls[0].headers.authorization).toBe('Bearer sk-test');
  });

  it('turns a 429 into a retryable error', async () => {
    const { fn } = fakeFetch(() => ({ status: 429, headers: { 'retry-after': '2' } }));
    const err = await openaiEmbeddingProvider('k', { fetchFn: fn }).embedBatch(['a'], 'query').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RetryableError);
    expect((err as RetryableError).retryAfterMs).toBe(2000);
  });
});

describe('teiProvider', () => {
  it('posts to /embed and accepts a plain array of vectors', async () => {
    const { fn, calls } = fakeFetch((_u, body) => ({ status: 200, json: body.inputs.map(() => vec(1)) }));
    const out = await teiProvider('http://localhost:8080/', { fetchFn: fn }).embedBatch(['a', 'b'], 'query');
    expect(out).toHaveLength(2);
    expect(calls[0].url).toBe('http://localhost:8080/embed');
  });
});

describe('embedAll', () => {
  const provider = (fail: number[]): EmbeddingProvider & { calls: number } => {
    let call = 0;
    const p = {
      name: 'fake',
      maxBatch: 2,
      calls: 0,
      async embedBatch(texts: string[]) {
        p.calls++;
        if (fail.includes(call++)) throw new RetryableError('429');
        return texts.map((t) => vec(Number(t)));
      },
    };
    return p;
  };

  it('batches in order', async () => {
    const out = await embedAll(provider([]), ['1', '2', '3', '4', '5'], 'document');
    expect(out.map((v) => v[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it('retries rate-limited batches', async () => {
    const p = provider([0, 1]);
    const out = await embedAll(p, ['1', '2'], 'document', { baseDelayMs: 1 });
    expect(out).toHaveLength(2);
    expect(p.calls).toBe(3);
  });

  it('gives up after maxRetries', async () => {
    await expect(embedAll(provider([0, 1, 2]), ['1'], 'document', { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('429');
  });
});

describe('cosine and nearest', () => {
  it('ranks by cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    const items = [
      { id: 'far', vector: [0, 1] },
      { id: 'near', vector: [1, 0.1] },
      { id: 'mid', vector: [1, 1] },
    ];
    expect(nearest([1, 0], items, 2)).toEqual(['near', 'mid']);
  });
});
