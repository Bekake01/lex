import { Injectable } from '@nestjs/common';
import {
  FIXTURE_ANCHORS,
  FIXTURE_ARTICLES,
  FIXTURE_VERSION_DATE,
} from './fixtures/articles.js';
import type {
  LawArticleHit,
  LawSearchQuery,
  LawSearchService,
} from './law-search.types.js';

/**
 * Stands in for A's `LawSearchService` until lex-api's `/search` is live
 * (Sync 1). Keyword overlap over a handful of fixture articles — enough to
 * exercise retrieval, the citation check and the eval harness end to end.
 */
@Injectable()
export class FakeLawSearchService implements LawSearchService {
  async search(q: LawSearchQuery): Promise<LawArticleHit[]> {
    const limit = q.limit ?? 30;
    const needles = q.queries
      .join(' ')
      .toLowerCase()
      .split(/[^\p{L}\p{N}‘’']+/u)
      .filter((w) => w.length > 3);

    const anchors = new Set(FIXTURE_ANCHORS[q.docType ?? 'other'] ?? []);

    const scored = FIXTURE_ARTICLES.map((article) => {
      const haystack =
        `${article.keywords.join(' ')} ${article.text}`.toLowerCase();
      const hits = needles.filter((n) => haystack.includes(n)).length;
      const anchorBoost = anchors.has(article.articleId) ? 1 : 0;
      const score = hits / Math.max(needles.length, 1) + anchorBoost;
      const { keywords: _keywords, ...hit } = article;
      return { ...hit, score };
    });

    return scored
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getArticles(ids: string[]): Promise<LawArticleHit[]> {
    const wanted = new Set(ids);
    return FIXTURE_ARTICLES.filter((a) => wanted.has(a.articleId)).map(
      ({ keywords: _keywords, ...hit }) => ({ ...hit, score: 1 }),
    );
  }

  async indexVersionDate(): Promise<string | null> {
    return FIXTURE_VERSION_DATE;
  }
}
