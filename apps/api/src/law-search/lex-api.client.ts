import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import {
  EditNotFoundError,
  type ApplyEdit,
  type DocProcessingService,
  type ExtractedDoc,
  type LawArticleHit,
  type LawSearchQuery,
  type LawSearchService,
} from './law-search.types.js';

/**
 * HTTP client for A's law service (`apps/lex-api`, port 5001).
 *
 * Server-to-server only: the API key never leaves this process, and no browser
 * ever talks to lex-api. Nothing here logs a request or response body — they
 * carry user contract text.
 */
@Injectable()
export class LexApiClient implements LawSearchService, DocProcessingService {
  private readonly logger = new Logger(LexApiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(@Inject(ENV) env: Env) {
    this.baseUrl = env.LEX_API_URL.replace(/\/+$/, '');
    this.apiKey = env.LEX_API_KEY ?? '';
  }

  async search(q: LawSearchQuery): Promise<LawArticleHit[]> {
    const body = await this.postJson<{ hits: LawArticleHit[] }>('/search', {
      queries: q.queries.slice(0, 20),
      docType: q.docType,
      inForceOnly: q.inForceOnly ?? true,
      limit: Math.min(q.limit ?? 30, 100),
    });
    return body.hits ?? [];
  }

  async getArticles(ids: string[]): Promise<LawArticleHit[]> {
    if (ids.length === 0) return [];
    const body = await this.postJson<{ articles: LawArticleHit[] }>(
      '/articles/batch',
      { ids },
    );
    return body.articles ?? [];
  }

  async indexVersionDate(): Promise<string | null> {
    const body = await this.getJson<{ indexVersionDate: string | null }>(
      '/meta',
    );
    return body.indexVersionDate ?? null;
  }

  async extractText(
    bytes: Uint8Array,
    contentType: string,
  ): Promise<ExtractedDoc> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes as BlobPart], { type: contentType }),
      'document',
    );
    const res = await this.fetchLex('/documents/extract', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw await this.failure('/documents/extract', res);
    return (await res.json()) as ExtractedDoc;
  }

  async applyEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([docx as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'document.docx',
    );
    form.append('edits', JSON.stringify(edits));

    const res = await this.fetchLex('/documents/apply-edits', {
      method: 'POST',
      body: form,
    });
    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { index?: number };
      throw new EditNotFoundError(body.index ?? -1);
    }
    if (!res.ok) throw await this.failure('/documents/apply-edits', res);
    return new Uint8Array(await res.arrayBuffer());
  }

  /* ------------------------------------------------------------ internals -- */

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchLex(path, { method: 'GET' });
    if (!res.ok) throw await this.failure(path, res);
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, payload: unknown): Promise<T> {
    const res = await this.fetchLex(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await this.failure(path, res);
    return (await res.json()) as T;
  }

  private fetchLex(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('x-lex-api-key', this.apiKey);
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(120_000),
    });
  }

  /** Logs the status and the route only — never the body. */
  private async failure(path: string, res: Response): Promise<Error> {
    this.logger.warn(`lex-api ${path} failed with ${res.status}`);
    return new Error(`lex-api ${path} failed with ${res.status}`);
  }
}
