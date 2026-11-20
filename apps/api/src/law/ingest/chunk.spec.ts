import type { NewLawArticle } from '../../db/schema/index.js';
import { countTokens } from '../text/index.js';
import { CHUNK_LIMITS, chunkArticle, splitText } from './chunk.js';

/** Whitespace at the cuts is not kept, so compare without it. */
const squash = (s: string) => s.replace(/\s+/g, '');

const SENTENCE =
  'Ijaraga beruvchi mol-mulkni ijarachiga shartnomada koʻrsatilgan muddatda va holatda topshirishi shart.';
/** About `n` sentences of real-looking legal text on one line, like the dataset. */
const sentences = (n: number) =>
  Array.from({ length: n }, (_, i) => `${i + 1}) ${SENTENCE}`).join(' ');

const article = (over: Partial<NewLawArticle>): NewLawArticle => ({
  id: '-111189-a535',
  docId: '-111189',
  articleNumber: '535',
  title: 'Mulk ijarasi shartnomasi',
  chapter: '34-bob. Mulk ijarasi',
  text: SENTENCE,
  textNorm: 'x',
  language: 'uz-latn',
  ...over,
});

describe('splitText', () => {
  it('returns short text unchanged', () => {
    expect(splitText(SENTENCE, 800, 400)).toEqual([SENTENCE]);
  });

  it('cuts only at sentence ends when sentences are available', () => {
    const chunks = splitText(sentences(200), 800, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.endsWith('shart.')).toBe(true);
  });

  it('keeps every chunk at or under the max', () => {
    for (const c of splitText(sentences(500), 800, 400)) {
      expect(countTokens(c)).toBeLessThanOrEqual(800);
    }
  });

  it('joins back into the original text', () => {
    const text = sentences(300);
    expect(squash(splitText(text, 800, 400).join(' '))).toBe(squash(text));
  });

  it('falls back to ; and : inside one huge sentence (a long list)', () => {
    const list = Array.from({ length: 300 }, (_, i) => `${i + 1}) ijara haqi toʻlanmaganda;`).join(' ');
    const chunks = splitText(`Quyidagi hollarda: ${list}`, 800, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(0, -1)) expect(c).toMatch(/[;:]$/);
    expect(squash(chunks.join(' '))).toBe(squash(`Quyidagi hollarda: ${list}`));
  });

  it('falls back to spaces when there is no punctuation at all', () => {
    const words = Array.from({ length: 3000 }, () => 'ijara').join(' ');
    const chunks = splitText(words, 800, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(countTokens(c)).toBeLessThanOrEqual(800);
    expect(squash(chunks.join(' '))).toBe(squash(words));
  });

  it('cuts one enormous word by characters', () => {
    const blob = 'x'.repeat(20_000);
    const chunks = splitText(blob, 800, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(countTokens(c)).toBeLessThanOrEqual(800);
    expect(squash(chunks.join(' '))).toBe(blob);
  });

  it('rebalances a too-small last chunk without going over the max', () => {
    // A tail of a few sentences after a full chunk: without rebalancing it
    // would be a tiny last chunk.
    const text = sentences(29);
    const chunks = splitText(text, 800, 400);
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(countTokens(c)).toBeGreaterThanOrEqual(400);
      expect(countTokens(c)).toBeLessThanOrEqual(800);
    }
    expect(squash(chunks.join(' '))).toBe(squash(text));
  });

  it('folds a tiny tail into the previous chunk when both fit under the max', () => {
    const chunks = splitText(`${sentences(20)} Oxirgi gap.`, 800, 400);
    expect(chunks.length).toBeLessThanOrEqual(2);
    for (const c of chunks) expect(countTokens(c)).toBeLessThanOrEqual(800);
  });
});

describe('chunkArticle', () => {
  it('keeps a normal article as one row', () => {
    const [row, ...rest] = chunkArticle(article({ nTokens: 40 }));
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ id: '-111189-a535', parentId: null, chunkIndex: 0 });
  });

  it('does not split an article under the article threshold, even above the flat one', () => {
    const text = sentences(40); // > 800, < 1500 tokens
    const n = countTokens(text);
    expect(n).toBeGreaterThan(CHUNK_LIMITS.flatSplitAt);
    expect(n).toBeLessThan(CHUNK_LIMITS.articleSplitAt);
    expect(chunkArticle(article({ text, nTokens: n }))).toHaveLength(1);
  });

  it('splits a long article into numbered parts that keep the heading', () => {
    const text = sentences(150);
    const parts = chunkArticle(article({ text, nTokens: countTokens(text) }));

    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p, i) => {
      expect(p.id).toBe(`-111189-a535-p${i + 1}`);
      expect(p.parentId).toBe('-111189-a535');
      expect(p.chunkIndex).toBe(i + 1);
      expect(p.articleNumber).toBe('535');
      expect(p.title).toBe('Mulk ijarasi shartnomasi');
      expect(p.chapter).toBe('34-bob. Mulk ijarasi');
      expect(p.textNorm.startsWith('mulk ijarasi shartnomasi\n')).toBe(true);
      expect(p.nTokens).toBe(countTokens(p.text));
      expect(p.nTokens).toBeLessThanOrEqual(CHUNK_LIMITS.articleMax);
    });
    expect(squash(parts.map((p) => p.text).join(' '))).toBe(squash(text));
  });

  it('splits a flat act into 400–800-token chunks', () => {
    const text = sentences(120);
    const parts = chunkArticle(
      article({ id: '-5838599-full', articleNumber: null, title: null, text, nTokens: countTokens(text) }),
    );
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.nTokens).toBeLessThanOrEqual(CHUNK_LIMITS.flatMax);
      expect(p.nTokens).toBeGreaterThanOrEqual(CHUNK_LIMITS.flatMin);
      expect(p.textNorm.startsWith('\n')).toBe(false);
    }
    expect(parts[0].id).toBe('-5838599-full-p1');
  });

  it('keeps a short flat act as one row', () => {
    expect(chunkArticle(article({ articleNumber: null, nTokens: 300 }))).toHaveLength(1);
  });

  it('clears the embedding on new parts', () => {
    const text = sentences(150);
    const parts = chunkArticle(article({ text, nTokens: countTokens(text), embedding: [1] }));
    for (const p of parts) expect(p.embedding).toBeNull();
  });
});
