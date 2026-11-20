import { normalizeUz } from './normalize.js';

describe('normalizeUz', () => {
  describe('oʻ and gʻ', () => {
    it.each([
      ["O'zbekiston Respublikasi", 'Oʻzbekiston Respublikasi'],
      ['O‘zbekiston Respublikasi', 'Oʻzbekiston Respublikasi'],
      ['O’zbekiston Respublikasi', 'Oʻzbekiston Respublikasi'],
      ['O`zbekiston Respublikasi', 'Oʻzbekiston Respublikasi'],
      ["Shaxsga doir ma'lumotlar to'g'risida", 'Shaxsga doir maʼlumotlar toʻgʻrisida'],
      ["Mehnat to'g`risidagi qonun hujjatlari", 'Mehnat toʻgʻrisidagi qonun hujjatlari'],
      ["G'aznachilik bo'linmasi", 'Gʻaznachilik boʻlinmasi'],
      ["O'ZBEKISTON RESPUBLIKASINING QONUNI", 'OʻZBEKISTON RESPUBLIKASINING QONUNI'],
    ])('%s', (input, expected) => {
      expect(normalizeUz(input)).toBe(expected);
    });

    it('handles gʻ at the end of a word (togʻ, bogʻ)', () => {
      expect(normalizeUz("tog' va bog' yerlari")).toBe('togʻ va bogʻ yerlari');
    });

    it('is idempotent on already-correct text', () => {
      const ok = 'Ijaraga beruvchi mol-mulkni ijarachiga shartnomada koʻrsatilgan muddatda topshirishi shart.';
      expect(normalizeUz(ok)).toBe(ok);
      expect(normalizeUz(normalizeUz("to'g'ri ma'no"))).toBe('toʻgʻri maʼno');
    });
  });

  describe('separator ʼ', () => {
    it.each([
      ["e'tiboran", 'eʼtiboran'],
      ["san'at va ma'naviyat", 'sanʼat va maʼnaviyat'],
      ['iste’molchilar huquqlarini himoya qilish', 'isteʼmolchilar huquqlarini himoya qilish'],
      // ʻ wrongly used as a separator is corrected to ʼ.
      ['maʻlumot', 'maʼlumot'],
    ])('%s', (input, expected) => {
      expect(normalizeUz(input)).toBe(expected);
    });
  });

  it('leaves quotes that are not inside a word', () => {
    expect(normalizeUz("'Ijara' deb ataladi")).toBe("'Ijara' deb ataladi");
  });

  describe('whitespace', () => {
    it('collapses spaces, tabs and non-breaking spaces', () => {
      expect(normalizeUz('535-modda.  Mulk   ijarasi\tshartnomasi')).toBe(
        '535-modda. Mulk ijarasi shartnomasi',
      );
    });

    it('keeps line breaks as single \\n and trims', () => {
      expect(normalizeUz('  1. Ijara haqi \r\n\r\n  2. Ijara muddati  \n')).toBe(
        '1. Ijara haqi\n2. Ijara muddati',
      );
    });

    it('removes zero-width characters and soft hyphens', () => {
      expect(normalizeUz('shart­noma​ tuzil﻿gan')).toBe('shartnoma tuzilgan');
    });
  });

  it('composes decomposed characters (NFC)', () => {
    expect(normalizeUz('Méhnat')).toBe('Méhnat');
  });

  it('lowercases for the search form', () => {
    expect(normalizeUz("O'ZBEKISTON Respublikasining FUQAROLIK kodeksi", { lowercase: true })).toBe(
      'oʻzbekiston respublikasining fuqarolik kodeksi',
    );
  });
});
