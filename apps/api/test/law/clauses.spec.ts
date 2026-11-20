import { splitClauses } from '../../src/law/documents/clauses.js';
import { CONTRACTS } from './fixtures/contracts.js';

describe('splitClauses on ten contracts', () => {
  describe.each(CONTRACTS.map((c) => [c.name, c] as const))('%s', (_name, contract) => {
    const clauses = splitClauses(contract.text);

    it('finds the clause numbers in order', () => {
      expect(clauses.map((c) => c.ref)).toEqual(contract.refs);
    });

    it('offsets slice the text back to each clause exactly', () => {
      for (const c of clauses) {
        expect(contract.text.slice(c.start, c.end)).toBe(c.text);
        expect(c.text).toBe(c.text.trim());
        expect(c.text.length).toBeGreaterThan(0);
      }
    });

    it('covers the whole document: nothing but whitespace between clauses', () => {
      let at = 0;
      for (const c of clauses) {
        expect(c.start).toBeGreaterThanOrEqual(at);
        expect(contract.text.slice(at, c.start).trim()).toBe('');
        at = c.end;
      }
      expect(contract.text.slice(at).trim()).toBe('');
    });

    if (contract.headings) {
      it('reads the clause headings', () => {
        const byRef = new Map(clauses.map((c) => [c.ref, c.heading]));
        for (const [ref, heading] of Object.entries(contract.headings!)) expect(byRef.get(ref)).toBe(heading);
      });
    }
  });
});

describe('splitClauses edge cases', () => {
  it('returns nothing for empty or blank text', () => {
    expect(splitClauses('')).toEqual([]);
    expect(splitClauses('  \n\n ')).toEqual([]);
  });

  it('does not take a date or an amount at a line start for a clause', () => {
    const text = '1. Muddat\n12.05.2026 gacha bajariladi.\n2. Narx\n1.500.000 soʻm toʻlanadi.';
    expect(splitClauses(text).map((c) => c.ref)).toEqual(['1', '2']);
  });

  it('keeps a numbered list inside the clause it belongs to', () => {
    const text = '1. Predmet\n2. Majburiyatlar:\n1. toʻlash;\n2. qabul qilish.\n3. Muddat';
    const clauses = splitClauses(text);
    expect(clauses.map((c) => c.ref)).toEqual(['1', '2', '3']);
    expect(clauses[1].text).toBe('2. Majburiyatlar:\n1. toʻlash;\n2. qabul qilish.');
  });

  it('gives no heading to a line that is a sentence or opens a list', () => {
    const clauses = splitClauses('1. Ijara haqi oyiga toʻlanadi.\n2. Taraflar quyidagilarga majbur:\n– toʻlash.');
    expect(clauses.map((c) => c.heading)).toEqual([undefined, undefined]);
  });

  it('accepts "Modda 3" and Cyrillic word numbering', () => {
    const text = 'Modda 1. Predmet\nMatn.\n2-модда. Нарх\nМатн.\nПункт 3. Сроки\nТекст.';
    expect(splitClauses(text).map((c) => c.ref)).toEqual(['Modda 1', '2-модда', 'Пункт 3']);
  });

  it('splits a text without blank lines into line paragraphs', () => {
    expect(splitClauses('Birinchi qator.\nIkkinchi qator.').map((c) => c.ref)).toEqual(['p1', 'p2']);
  });
});
