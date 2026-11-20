import { describe, expect, it } from 'vitest';
import { anonymisationWarnings, parseCase } from './case-schema.js';

const valid = {
  id: 'rental-07',
  notes: 'Tashkent agency, 2026-03. Names and addresses replaced.',
  docType: 'rental',
  language: 'uz',
  text: '1. Ijara shartnomasi. '.repeat(20),
  expectedIssues: [{ clauseRef: '3', anyOf: ['oshirish'], severity: 'high' }],
};

describe('parseCase', () => {
  it('accepts a well-formed case', () => {
    const parsed = parseCase('rental-07.json', valid);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.id).toBe('rental-07');
  });

  it('names the file and the field when something is wrong', () => {
    const parsed = parseCase('rental-07.json', { ...valid, docType: 'rent' });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.problem).toContain('rental-07.json');
      expect(parsed.problem).toContain('docType');
    }
  });

  it('rejects a case too short to be a contract', () => {
    // Otherwise it quietly scores 0 and drags the whole run down.
    expect(parseCase('x.json', { ...valid, text: 'Shartnoma.' }).ok).toBe(
      false,
    );
  });

  it('rejects an id that will not sort or filter', () => {
    expect(parseCase('x.json', { ...valid, id: 'Rental 7' }).ok).toBe(false);
  });

  it('allows a case with no expected issues (a clean contract)', () => {
    expect(parseCase('x.json', { ...valid, expectedIssues: [] }).ok).toBe(true);
  });
});

describe('anonymisationWarnings', () => {
  it.each([
    ['a phone number', 'Tel: +998 90 123 45 67'],
    ['a passport number', 'Pasport AA 1234567 raqamli'],
    ['an INN or PINFL', 'STIR 123456789 raqami'],
    ['an email address', 'Aloqa: alisher@example.uz'],
  ])('warns about %s', (what, text) => {
    expect(anonymisationWarnings(text)).toContain(what);
  });

  it('says nothing about the numbers a contract is made of', () => {
    expect(
      anonymisationWarnings(
        "Ijara haqi oyiga 5 000 000 so'm, 2026-03-01 dan boshlab, 12 oy muddatga.",
      ),
    ).toEqual([]);
  });
});
