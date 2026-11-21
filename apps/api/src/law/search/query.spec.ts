import { definitionTopic, fuseRankings, mostWordsTsQuery, normalizeQuery, queryStems, requiredWords, stem, toTsQuery } from './query.js';

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

describe('mostWordsTsQuery', () => {
  it('needs all of 1–2 words, all but one of 3–5, all but two of 6+', () => {
    expect([1, 2, 3, 5, 6, 8].map(requiredWords)).toEqual([1, 2, 2, 4, 4, 6]);
    expect(mostWordsTsQuery(['a', 'b'])).toBe("('a':* & 'b':*)");
    expect(mostWordsTsQuery(['a', 'b', 'c'])).toBe("('a':* & 'b':*) | ('a':* & 'c':*) | ('b':* & 'c':*)");
    expect(mostWordsTsQuery([])).toBeNull();
  });

  it('caps the number of combinations for long queries', () => {
    const stems = Array.from({ length: 12 }, (_, i) => `w${i}`);
    expect(mostWordsTsQuery(stems)!.split(' | ').length).toBeLessThanOrEqual(40);
  });
});

describe('definitionTopic', () => {
  it('returns the topic of a "what does X mean" query', () => {
    expect(definitionTopic('tijorat siri tushunchasi')).toEqual(['tijorat', 'siri']);
    expect(definitionTopic('ijara nima')).toEqual(['ijara']);
  });

  it('is null for other queries or a definition word alone', () => {
    expect(definitionTopic('ijara shartnomasini bekor qilish')).toBeNull();
    expect(definitionTopic('tushuncha')).toBeNull();
  });
});
