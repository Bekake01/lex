import { Injectable } from '@nestjs/common';
import { SearchService } from '../law/search/search.service.js';
import type {
  LawArticleHit,
  LawSearchQuery,
  LawSearchService,
} from './law-search.types.js';

/**
 * The real law search: the in-process `LawModule` over `law_acts` /
 * `law_articles` (loaded with `pnpm ingest:hf`). Replaces the old HTTP client
 * for `apps/lex-api`, which was merged into this app.
 */
@Injectable()
export class DbLawSearchService implements LawSearchService {
  constructor(private readonly law: SearchService) {}

  search(q: LawSearchQuery): Promise<LawArticleHit[]> {
    return this.law.search({
      queries: q.queries.slice(0, 20),
      // Unused by keyword search today; anchor acts per docType come in law Phase 9.
      docType: q.docType,
      inForceOnly: q.inForceOnly ?? true,
      limit: Math.min(q.limit ?? 30, 100),
    });
  }

  getArticles(ids: string[]): Promise<LawArticleHit[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.law.articles(ids);
  }

  async indexVersionDate(): Promise<string | null> {
    return (await this.law.meta()).indexVersionDate;
  }

  /** True when the law tables hold articles (`auto` mode picks the db then). */
  async hasData(): Promise<boolean> {
    return (await this.law.meta()).articles > 0;
  }
}
