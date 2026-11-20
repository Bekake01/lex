import { describe, expect, it } from 'vitest';
import type {
  LawArticleHit,
  LawSearchService,
} from '../law-search/law-search.types.js';
import { checkCitations } from './citations.js';

function hit(id: string): LawArticleHit {
  return {
    articleId: id,
    actTitle: 'Fuqarolik kodeksi',
    actType: 'code',
    articleNumber: id.slice(-3),
    text: 'text',
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: '2026-06-01',
    core: true,
    score: 1,
  };
}

function lawSearch(indexed: LawArticleHit[]): LawSearchService {
  return {
    search: async () => [],
    getArticles: async (ids) =>
      indexed.filter((a) => ids.includes(a.articleId)),
    indexVersionDate: async () => '2026-06-01',
  };
}

describe('checkCitations', () => {
  it('keeps a citation that was in the retrieved set', async () => {
    const retrieved = [hit('a-1'), hit('a-2')];
    const check = await checkCitations(lawSearch(retrieved), retrieved, [
      'a-2',
    ]);

    expect(check.snapshots.get('a-2')).toMatchObject({
      articleId: 'a-2',
      actTitle: 'Fuqarolik kodeksi',
      sourceUrl: 'https://lex.uz/docs/111181',
    });
    expect(check.failures.size).toBe(0);
  });

  it('drops an id that exists in the index but was not retrieved, as a retrieval failure', async () => {
    const retrieved = [hit('a-1')];
    const check = await checkCitations(
      lawSearch([hit('a-1'), hit('a-9')]),
      retrieved,
      ['a-9'],
    );

    expect(check.snapshots.has('a-9')).toBe(false);
    expect(check.failures.get('a-9')).toBe('retrieval');
  });

  it('labels an id that exists nowhere as a model failure', async () => {
    const retrieved = [hit('a-1')];
    const check = await checkCitations(lawSearch(retrieved), retrieved, [
      'made-up-42',
    ]);

    expect(check.failures.get('made-up-42')).toBe('model');
  });

  it('ignores nulls, which are findings with no supporting norm', async () => {
    const check = await checkCitations(lawSearch([]), [], [null, undefined]);
    expect(check.snapshots.size).toBe(0);
    expect(check.failures.size).toBe(0);
  });

  it('still answers when the law service is down', async () => {
    const broken: LawSearchService = {
      search: async () => [],
      getArticles: async () => {
        throw new Error('lex-api down');
      },
      indexVersionDate: async () => null,
    };
    const check = await checkCitations(broken, [], ['a-1']);
    expect(check.failures.get('a-1')).toBe('model');
  });
});
