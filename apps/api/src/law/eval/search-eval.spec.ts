import { readFileSync } from 'node:fs';
import {
  articleOf,
  formatReport,
  parseQueries,
  runSearchEval,
  scoreQuery,
  summarize,
  type EvalQuery,
} from './search-eval.js';

const q = (over: Partial<EvalQuery> = {}): EvalQuery => ({
  id: 'q1',
  topic: 'rental',
  docType: 'rental',
  query: 'ijara',
  expected: ['A', 'B'],
  ...over,
});

describe('articleOf', () => {
  it('maps a part to its article and leaves whole ids alone', () => {
    expect(articleOf('-180552-a551-p2')).toBe('-180552-a551');
    expect(articleOf('-5838599-full-p13')).toBe('-5838599-full');
    expect(articleOf('-180552-a551')).toBe('-180552-a551');
    expect(articleOf('-100711-full-d2')).toBe('-100711-full-d2');
  });
});

describe('scoreQuery', () => {
  it('finds the first expected rank and recall', () => {
    const r = scoreQuery(q(), ['X', 'B', 'Y', 'Z', 'W', 'V', 'A']);
    expect(r.firstRank).toBe(2);
    expect(r.recall5).toBe(0.5);
    expect(r.recall10).toBe(1);
  });

  it('collapses parts of one article into one result', () => {
    const r = scoreQuery(q({ expected: ['C'] }), ['A-p1', 'A-p2', 'A-p3', 'B', 'D', 'C']);
    expect(r.ranked).toEqual(['A', 'B', 'D', 'C']);
    expect(r.firstRank).toBe(4);
  });

  it('reports a miss', () => {
    const r = scoreQuery(q(), []);
    expect(r).toMatchObject({ firstRank: null, recall5: 0, recall10: 0 });
  });
});

describe('summarize', () => {
  it('averages over queries and per topic', () => {
    const s = summarize([
      scoreQuery(q({ id: '1', expected: ['A'] }), ['A']),
      scoreQuery(q({ id: '2', expected: ['A'] }), ['X', 'A']),
      scoreQuery(q({ id: '3', topic: 'sale', expected: ['A'] }), ['X']),
    ]);
    expect(s.queries).toBe(3);
    expect(s.mrr).toBeCloseTo((1 + 0.5 + 0) / 3);
    expect(s.hit10).toBeCloseTo(2 / 3);
    expect(s.byTopic.rental).toMatchObject({ queries: 2, recall10: 1, mrr: 0.75 });
    expect(s.byTopic.sale).toMatchObject({ queries: 1, recall10: 0, mrr: 0 });
  });
});

describe('runSearchEval and formatReport', () => {
  it('runs a retriever and lists the misses', async () => {
    const { summary, results } = await runSearchEval(
      [q({ id: 'hit', expected: ['A'] }), q({ id: 'miss', expected: ['Z'] })],
      async () => ['A', 'B'],
    );
    const text = formatReport('test', summary, results);
    expect(text).toContain('ALL');
    expect(text).toContain('Missed in top 10 (1)');
    expect(text).toContain('miss');
  });
});

describe('parseQueries', () => {
  it('names the line of a bad entry', () => {
    expect(() => parseQueries('{"id":"a","topic":"t","docType":"rental","query":"x","expected":["A"]}\n{"id":"b"}')).toThrow(
      /line 2/,
    );
    expect(() => parseQueries('not json')).toThrow(/line 1: not valid JSON/);
  });

  it('rejects duplicate ids', () => {
    const line = '{"id":"a","topic":"t","docType":"rental","query":"x","expected":["A"]}';
    expect(() => parseQueries(`${line}\n${line}`)).toThrow(/duplicate/);
  });

  it('accepts the real query set', () => {
    const queries = parseQueries(readFileSync('eval/search/queries.jsonl', 'utf8'));
    expect(queries.length).toBeGreaterThanOrEqual(100);
  });
});
