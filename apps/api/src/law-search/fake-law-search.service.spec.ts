import { describe, expect, it } from 'vitest';
import {
  FakeDocProcessingService,
  splitClauses,
} from './fake-doc-processing.service.js';
import { FakeLawSearchService } from './fake-law-search.service.js';

describe('FakeLawSearchService', () => {
  const service = new FakeLawSearchService();

  it('always returns the anchor acts for the document type', async () => {
    const hits = await service.search({
      queries: ['something unrelated to any fixture'],
      docType: 'employment',
    });
    const ids = hits.map((h) => h.articleId);
    expect(ids).toContain('fx-labor-a72');
    expect(ids).toContain('fx-labor-a95');
  });

  it('ranks a keyword match above an unrelated anchor', async () => {
    const hits = await service.search({
      queries: ['ijara haqini oshirish tartibi'],
      docType: 'rental',
    });
    expect(hits[0].score).toBeGreaterThan(1);
  });

  it('respects the limit', async () => {
    const hits = await service.search({ queries: ['shartnoma'], limit: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it('returns only the articles asked for by id', async () => {
    const found = await service.getArticles(['fx-secret-a7', 'nope']);
    expect(found.map((a) => a.articleId)).toEqual(['fx-secret-a7']);
  });

  it('reports a version date for "checked against legislation as of …"', async () => {
    expect(await service.indexVersionDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('splitClauses', () => {
  it('splits numbered clauses and keeps their refs', () => {
    const clauses = splitClauses(
      '1. Birinchi shart matni.\n2.1. Ikkinchi shart matni.\n3. Uchinchi.',
    );
    expect(clauses.map((c) => c.ref)).toEqual(['1', '2.1', '3']);
    expect(clauses[0].text).toBe('Birinchi shart matni.');
  });

  it('treats text with no numbering as one clause', () => {
    const clauses = splitClauses('A contract without any numbering at all.');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].ref).toBe('1');
  });

  it('returns nothing for empty text', () => {
    expect(splitClauses('   ')).toEqual([]);
  });
});

describe('FakeDocProcessingService', () => {
  const service = new FakeDocProcessingService();

  it('extracts plain text with clauses', async () => {
    const bytes = new TextEncoder().encode('1. Shart.\n2. Boshqa shart.');
    const extracted = await service.extractText(bytes, 'text/plain');
    expect(extracted.scanned).toBe(false);
    expect(extracted.clauses).toHaveLength(2);
  });

  it('marks a PDF as scanned so the review sends it to Claude directly', async () => {
    const extracted = await service.extractText(
      new Uint8Array([1]),
      'application/pdf',
    );
    expect(extracted.scanned).toBe(true);
    expect(extracted.text).toBe('');
  });

  it('says what to do about DOCX instead of guessing', async () => {
    await expect(
      service.extractText(
        new Uint8Array([1]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).rejects.toThrow(/apps\/lex-api/);
  });
});
