import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A polite client for lex.uz (law plan, Phase 9). lex.uz has no API and is
 * the national legal database, so:
 * - one request at a time, at least `delayMs` apart (default 20 s, the
 *   crawl delay lex.uz published in its robots.txt);
 * - a user agent naming this service only (no personal contact);
 * - retries with backoff on 429/5xx/network errors, and a full stop after
 *   repeated failures instead of hammering the site;
 * - pages are cached on disk, so re-runs and tests send no requests.
 * Only ingest commands use this; the app never calls lex.uz during a request.
 */
export interface LexUzFetcherOptions {
  delayMs?: number;
  retries?: number;
  /** Stop the whole run after this many failed pages in a row. */
  maxConsecutiveFailures?: number;
  cacheDir?: string;
  /** Re-download even when a cached copy exists. */
  refresh?: boolean;
  userAgent?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class LexUzNotFoundError extends Error {}

export class LexUzFetcher {
  private lastRequestAt = -Infinity;
  private consecutiveFailures = 0;
  requests = 0;
  private readonly o: Required<Omit<LexUzFetcherOptions, 'cacheDir'>> & { cacheDir?: string };

  constructor(options: LexUzFetcherOptions = {}) {
    this.o = {
      delayMs: 20_000,
      retries: 3,
      maxConsecutiveFailures: 3,
      refresh: false,
      userAgent: 'lex-law-index/1.0 (Uzbek legislation index for contract review)',
      fetchFn: fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      ...options,
    };
  }

  static url(docId: string, lang: 'uz' | 'ru' = 'uz'): string {
    if (!/^-?\d+$/.test(docId)) throw new Error(`Invalid lex.uz document id: ${docId}`);
    return `https://lex.uz/${lang}/docs/${docId}`;
  }

  /** The HTML of a document page, from the cache when present. */
  async page(docId: string, lang: 'uz' | 'ru' = 'uz'): Promise<string> {
    const cached = this.o.cacheDir ? join(this.o.cacheDir, lang, `${docId}.html`) : null;
    if (cached && !this.o.refresh && existsSync(cached)) return readFileSync(cached, 'utf8');

    const html = await this.download(LexUzFetcher.url(docId, lang));
    if (cached) {
      mkdirSync(join(this.o.cacheDir!, lang), { recursive: true });
      writeFileSync(cached, html);
    }
    return html;
  }

  private async download(url: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.o.delayMs - this.o.now();
      if (wait > 0) await this.o.sleep(wait);
      this.lastRequestAt = this.o.now();
      this.requests++;

      let status = 0;
      try {
        const res = await this.o.fetchFn(url, { headers: { 'user-agent': this.o.userAgent, accept: 'text/html' }, redirect: 'follow' });
        status = res.status;
        if (res.ok) {
          this.consecutiveFailures = 0;
          return await res.text();
        }
        if (res.status === 404) throw new LexUzNotFoundError(`lex.uz: no document at ${url}`);
      } catch (error) {
        if (error instanceof LexUzNotFoundError) throw error;
        // network error: retried below like a 5xx
      }

      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= this.o.retries) {
        if (++this.consecutiveFailures >= this.o.maxConsecutiveFailures) {
          throw new Error(`lex.uz failed ${this.consecutiveFailures} pages in a row (last: ${status || 'network error'}); stopping to avoid hammering the site`);
        }
        throw new Error(`lex.uz: ${url} failed (${status || 'network error'})`);
      }
      await this.o.sleep(this.o.delayMs * 2 ** attempt);
    }
  }
}
