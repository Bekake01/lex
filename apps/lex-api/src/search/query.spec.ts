import { fuseRankings, normalizeQuery, queryStems, stem, toTsQuery } from './query.js';

describe('stem', () => {
  it.each([
    ['shartnomasini', 'shartnoma'],
    ['shartnomasi', 'shartnoma'],
    ['ijaraga', 'ijara'],
    ['ijarachilarning', 'ijarachi'],
    ['majburiyatlari', 'majburiyat'],
    ['muddatidan', 'muddat'],
    // Too short a stem would match too much; the word is kept.
    ['qilish', 'qilish'],
    ['bekor', 'bekor'],
  ])('%s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
});

describe('queryStems', () => {
  it('normalizes, drops stopwords and stems', () => {
    expect(queryStems("Ijara shartnomasini bekor qilish va to'lov")).toEqual([
      'ijara', 'shartnoma', 'bekor', 'qilish', 'toʻlov',
    ]);
  });

  it('converts an Uzbek Cyrillic query to Latin first', () => {
    expect(normalizeQuery('Ижара шартномаси')).toBe('ijara shartnomasi');
    expect(queryStems('Ижара шартномаси')).toEqual(['ijara', 'shartnoma']);
  });

  it('removes duplicates', () => {
    expect(queryStems('ijara ijaraga ijarasi')).toEqual(['ijara']);
  });
});

describe('toTsQuery', () => {
  it('ORs quoted prefix terms', () => {
    expect(toTsQuery('mulk ijarasi')).toBe("'mulk':* | 'ijara':*");
  });

  it('is null when nothing searchable is left', () => {
    expect(toTsQuery('va, yoki — bilan!')).toBeNull();
  });

  it('cannot be broken by tsquery syntax in the input', () => {
    expect(toTsQuery("ijara & !(x | y) 'z'")).toBe("'ijara':*");
  });
});

describe('fuseRankings', () => {
  it('ranks an id found by several queries above one found once', () => {
    const scores = fuseRankings([
      ['a', 'b'],
      ['c', 'b'],
    ]);
    const order = [...scores].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(order[0]).toBe('b');
    expect(order).toHaveLength(3);
  });
});
