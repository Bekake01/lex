import { describe, expect, it } from 'vitest';
import type { ExtractedClause } from '../db/schema/index.js';
import { clauseOutline, normaliseRef, resolveClause } from './clauses.js';

/** Shaped like extraction's output: `text === document.slice(start, end)`. */
const clauses: ExtractedClause[] = [
  {
    ref: '1',
    heading: 'Shartnoma predmeti',
    text: '1. Shartnoma predmeti. Ijaraga beruvchi binoni topshiradi.',
    start: 0,
    end: 58,
  },
  {
    ref: '4.2',
    heading: 'Ijara haqi',
    text: '4.2. Ijara haqi har oyning 5-kunigacha toʻlanadi.',
    start: 58,
    end: 106,
  },
  {
    ref: '7-modda',
    text: '7-modda. Nizolar sud tartibida hal qilinadi.',
    start: 106,
    end: 150,
  },
  {
    ref: 'p3',
    text: 'Taraflar kelishuvga erishmagan hollarda shartnoma bekor qilinadi.',
    start: 150,
    end: 214,
  },
];

describe('normaliseRef', () => {
  it('ignores the decoration around a number', () => {
    expect(normaliseRef('4.2.')).toBe('4.2');
    expect(normaliseRef('Clause 4.2')).toBe('4.2');
    expect(normaliseRef(' 4.2) ')).toBe('4.2');
    expect(normaliseRef('Пункт 3')).toBe('3');
  });

  it('keeps a ref that is a word, not decoration', () => {
    expect(normaliseRef('7-modda')).toBe('7-modda');
  });
});

describe('resolveClause', () => {
  it('matches the document ref however the model decorated it', () => {
    expect(resolveClause(clauses, 'clause 4.2.')).toEqual({
      ref: '4.2',
      start: 58,
      end: 106,
    });
  });

  it('matches an Uzbek article ref', () => {
    expect(resolveClause(clauses, '7-MODDA').ref).toBe('7-modda');
  });

  it('falls back to the clause containing the quote', () => {
    // The model invented "9.1" but quoted an unnumbered paragraph.
    const resolved = resolveClause(clauses, '9.1', 'shartnoma bekor qilinadi');

    expect(resolved).toEqual({ ref: 'p3', start: 150, end: 214 });
  });

  it('keeps an invented ref with no offsets when nothing matches', () => {
    expect(
      resolveClause(clauses, '12.4 ', 'wording not in the document'),
    ).toEqual({ ref: '12.4', start: null, end: null });
  });

  it('does not match on a quote too short to be distinctive', () => {
    expect(resolveClause(clauses, '9.1', 'Ijara').start).toBeNull();
  });

  it('keeps the model ref when the document has no clauses at all', () => {
    // A scanned PDF: nothing was extracted, so nothing can be resolved.
    expect(resolveClause([], '4.2', 'anything')).toEqual({
      ref: '4.2',
      start: null,
      end: null,
    });
  });
});

describe('clauseOutline', () => {
  it('lists refs with their headings', () => {
    expect(clauseOutline(clauses)).toEqual([
      '1 — Shartnoma predmeti',
      '4.2 — Ijara haqi',
      '7-modda',
      'p3',
    ]);
  });

  it('caps the list, because it sits in front of every call', () => {
    const many: ExtractedClause[] = Array.from({ length: 300 }, (_, i) => ({
      ref: `${i + 1}`,
      text: 'x',
      start: i,
      end: i + 1,
    }));

    expect(clauseOutline(many)).toHaveLength(150);
    expect(clauseOutline(many, 10)).toHaveLength(10);
  });
});
