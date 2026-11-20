import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { normalizeQuery } from '../search/query.js';
import { embedAll, teiProvider, voyageProvider, type EmbeddingProvider } from './embeddings.js';

/** Injection token for a provider override (tests, or a different deployment). */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/** The configured provider: Voyage by default (Phase 7), bge-m3 as a fallback; null when not configured. */
export function createEmbeddingProvider(env: Env): EmbeddingProvider | null {
  if (env.EMBEDDING_PROVIDER === 'bge-m3') return env.EMBEDDING_URL ? teiProvider(env.EMBEDDING_URL) : null;
  return env.VOYAGE_API_KEY ? voyageProvider(env.VOYAGE_API_KEY) : null;
}

/** What gets embedded for a law row: act title, article heading, body (as measured in Phase 7). */
export function embeddingText(actTitle: string | null, title: string | null, text: string): string {
  return [actTitle, title, text].filter(Boolean).join('\n');
}

/** Distinct query embeddings kept in memory; queries repeat a lot across reviews. */
const QUERY_CACHE_SIZE = 2000;

/**
 * Embeddings for law search. Without a configured provider (no
 * VOYAGE_API_KEY), `enabled` is false and search runs keyword-only.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  readonly provider: EmbeddingProvider | null;
  /** Insertion-ordered map used as an LRU: re-inserting moves a key to the end. */
  private readonly cache = new Map<string, number[]>();

  constructor(
    @Inject(ENV) env: Env,
    @Optional() @Inject(EMBEDDING_PROVIDER) provider?: EmbeddingProvider | null,
  ) {
    this.provider = provider === undefined ? createEmbeddingProvider(env) : provider;
  }

  get enabled(): boolean {
    return this.provider !== null;
  }

  /** The text a query is embedded as: normalized, and Latin even when typed in Cyrillic. */
  static queryText(query: string): string {
    return normalizeQuery(query);
  }

  /**
   * Query vectors, one per query (null when embeddings are off or the
   * provider failed: search then falls back to keyword-only instead of failing).
   */
  async embedQueries(queries: string[]): Promise<(number[] | null)[]> {
    const provider = this.provider;
    if (!provider) return queries.map(() => null);

    const texts = queries.map((q) => EmbeddingService.queryText(q));
    const missing = [...new Set(texts.filter((t) => !this.cache.has(t)))];
    if (missing.length > 0) {
      try {
        const vectors = await embedAll(provider, missing, 'query', { maxRetries: 2 });
        missing.forEach((t, i) => this.remember(t, vectors[i]));
      } catch (error) {
        // Status code only: provider errors never carry the query text here.
        this.logger.warn(`query embedding failed, keyword-only for this search: ${(error as Error).message}`);
        return queries.map(() => null);
      }
    }
    return texts.map((t) => this.touch(t));
  }

  /** Document vectors for ingestion; throws when not configured or on provider failure. */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!this.provider) throw new Error('Embeddings are not configured: set VOYAGE_API_KEY (or EMBEDDING_URL for bge-m3)');
    return embedAll(this.provider, texts, 'document');
  }

  private touch(text: string): number[] | null {
    const vector = this.cache.get(text);
    if (!vector) return null;
    this.cache.delete(text);
    this.cache.set(text, vector);
    return vector;
  }

  private remember(text: string, vector: number[]): void {
    this.cache.set(text, vector);
    while (this.cache.size > QUERY_CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
  }
}
