import { EMBEDDING_DIMENSIONS } from '../../db/schema/law.js';

/**
 * Text embeddings for law search. One interface, three candidate providers
 * (decided by measurement in Phase 7, see docs/decisions/embeddings.md):
 * - OpenAI `text-embedding-3-large` at 1024 dims (OPENAI_API_KEY)
 * - Voyage `voyage-3.5` over its HTTP API (VOYAGE_API_KEY)
 * - bge-m3 behind a text-embeddings-inference server (EMBEDDING_URL)
 * All return 1024-d vectors, the size of law_articles.embedding.
 */

/** Documents and queries are embedded differently by some models (Voyage). */
export type EmbedKind = 'document' | 'query';

export interface EmbeddingProvider {
  readonly name: string;
  /** Embeds one batch; callers use embedAll() for batching and retries. */
  embedBatch(texts: string[], kind: EmbedKind): Promise<number[][]>;
  /** Largest batch the provider accepts. */
  readonly maxBatch: number;
}

type FetchFn = typeof fetch;

/** An HTTP failure that may succeed on retry (rate limit, server error). */
export class RetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function postJson(fetchFn: FetchFn, url: string, body: unknown, headers: Record<string, string>) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new RetryableError(`${url} → ${res.status}`, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (!res.ok) {
    // The body may echo input text; report the status only.
    throw new Error(`${url} → ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

function checkVectors(vectors: unknown, count: number, name: string): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== count) {
    throw new Error(`${name}: expected ${count} vectors, got ${Array.isArray(vectors) ? vectors.length : typeof vectors}`);
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`${name}: expected ${EMBEDDING_DIMENSIONS}-d vectors, got ${Array.isArray(v) ? v.length : typeof v}`);
    }
  }
  return vectors as number[][];
}

export function voyageProvider(
  apiKey: string,
  { model = 'voyage-3.5', fetchFn = fetch }: { model?: string; fetchFn?: FetchFn } = {},
): EmbeddingProvider {
  return {
    name: `voyage:${model}`,
    maxBatch: 128,
    async embedBatch(texts, kind) {
      const json = (await postJson(
        fetchFn,
        'https://api.voyageai.com/v1/embeddings',
        { model, input: texts, input_type: kind, output_dimension: EMBEDDING_DIMENSIONS, truncation: true },
        { authorization: `Bearer ${apiKey}` },
      )) as { data?: { embedding: number[]; index: number }[] };
      const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      return checkVectors(
        data.map((d) => d.embedding),
        texts.length,
        'voyage',
      );
    },
  };
}

/**
 * OpenAI `text-embedding-3-large`, shortened to 1024 dimensions (the model
 * supports this natively via `dimensions`; quality loss is small). Uses the
 * same OPENAI_API_KEY as the AI review. No query/document distinction.
 */
export function openaiEmbeddingProvider(
  apiKey: string,
  { model = 'text-embedding-3-large', fetchFn = fetch }: { model?: string; fetchFn?: FetchFn } = {},
): EmbeddingProvider {
  return {
    name: `openai:${model}`,
    // OpenAI caps a request at 300k tokens; Uzbek tokenizes densely, so stay small.
    maxBatch: 64,
    async embedBatch(texts) {
      const json = (await postJson(
        fetchFn,
        'https://api.openai.com/v1/embeddings',
        { model, input: texts, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' },
        { authorization: `Bearer ${apiKey}` },
      )) as { data?: { embedding: number[]; index: number }[] };
      const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      return checkVectors(
        data.map((d) => d.embedding),
        texts.length,
        'openai',
      );
    },
  };
}

/**
 * bge-m3 served by Hugging Face text-embeddings-inference
 * (`docker run ghcr.io/huggingface/text-embeddings-inference --model-id BAAI/bge-m3`).
 * bge-m3 needs no query/document prefix.
 */
export function teiProvider(baseUrl: string, { fetchFn = fetch }: { fetchFn?: FetchFn } = {}): EmbeddingProvider {
  const url = `${baseUrl.replace(/\/+$/, '')}/embed`;
  return {
    name: 'bge-m3:tei',
    maxBatch: 32,
    async embedBatch(texts) {
      const json = await postJson(fetchFn, url, { inputs: texts, truncate: true, normalize: true }, {});
      return checkVectors(json, texts.length, 'bge-m3');
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embeds any number of texts in provider-sized batches, in order. Retries a
 * batch on rate limits and server errors with exponential backoff.
 */
export async function embedAll(
  provider: EmbeddingProvider,
  texts: string[],
  kind: EmbedKind,
  {
    maxRetries = 5,
    baseDelayMs = 1000,
    onProgress,
  }: { maxRetries?: number; baseDelayMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += provider.maxBatch) {
    const batch = texts.slice(i, i + provider.maxBatch);
    for (let attempt = 0; ; attempt++) {
      try {
        out.push(...(await provider.embedBatch(batch, kind)));
        break;
      } catch (err) {
        if (!(err instanceof RetryableError) || attempt >= maxRetries) throw err;
        await sleep(err.retryAfterMs ?? baseDelayMs * 2 ** attempt);
      }
    }
    onProgress?.(out.length, texts.length);
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Ids of the `k` vectors closest to `query` (brute force; for evals and small sets). */
export function nearest(query: number[], items: { id: string; vector: number[] }[], k: number): string[] {
  return items
    .map((it) => ({ id: it.id, score: cosine(query, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.id);
}
