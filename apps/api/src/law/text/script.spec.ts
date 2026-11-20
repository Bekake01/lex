import { detectScript } from './script.js';
import { countTokens } from './tokens.js';

describe('detectScript', () => {
  it('detects Latin Uzbek', () => {
    expect(detectScript('Oʻzbekiston Respublikasining Fuqarolik kodeksi').script).toBe('latn');
  });

  it('detects Cyrillic Uzbek', () => {
    expect(detectScript('Ўзбекистон Республикасининг Фуқаролик кодекси').script).toBe('cyrl');
  });

  it('detects Russian as Cyrillic', () => {
    expect(detectScript('Гражданский кодекс Республики Узбекистан').script).toBe('cyrl');
  });

  it('reports a mixed text with its shares', () => {
    const stats = detectScript('Ijara shartnomasi — Договор аренды');
    expect(stats.script).toBe('mixed');
    expect(stats.cyrillic + stats.latin).toBeCloseTo(1);
  });

  it('tolerates a few foreign letters (article numbers, abbreviations)', () => {
    expect(detectScript('Фуқаролик кодексининг 535-моддаси (ID 111189, PDF)').script).toBe('cyrl');
  });

  it('returns none for text without letters', () => {
    expect(detectScript('535. — 1.2.3 (2026)')).toEqual({ script: 'none', cyrillic: 0, latin: 0 });
  });
});

describe('countTokens', () => {
  it('is 0 for empty or whitespace-only text', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens(' \n\t ')).toBe(0);
  });

  it('estimates a Latin legal sentence in a sensible range', () => {
    // 85 Latin letters, 2 punctuation marks → about 26 tokens.
    const n = countTokens('Ijaraga beruvchi mol-mulkni ijarachiga shartnomada koʻrsatilgan muddatda topshirishi shart.');
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThanOrEqual(35);
  });

  it('counts Cyrillic as denser than Latin for the same words', () => {
    expect(countTokens('Мулк ижараси шартномаси')).toBeGreaterThan(countTokens('Mulk ijarasi shartnomasi'));
  });

  it('does not count the oʻ/gʻ mark or separator as extra tokens', () => {
    expect(countTokens('toʻgʻrisida maʼlumot')).toBe(countTokens('togrisida malumot'));
  });

  it('grows with text length', () => {
    const article = 'Mulk ijarasi shartnomasi boʻyicha ijaraga beruvchi haq evaziga mol-mulkni vaqtincha egallash va foydalanishga beradi. ';
    expect(countTokens(article.repeat(10))).toBeGreaterThan(countTokens(article) * 9);
  });
});
