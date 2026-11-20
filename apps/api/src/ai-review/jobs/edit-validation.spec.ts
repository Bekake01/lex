import { describe, expect, it } from 'vitest';
import { occurrences } from './revise-document.processor.js';

/**
 * An edit may only be offered when its `original` locates one place in the
 * document, because that is the precondition for applying it safely.
 */
describe('occurrences', () => {
  const document = `1. Ijara haqi oyiga 5 000 000 so'm.
2. Ijaraga beruvchi ijara haqini istalgan vaqtda oshirishi mumkin.
3. Ijara haqi oyiga 5 000 000 so'm.`;

  it('finds a unique string once', () => {
    expect(occurrences(document, 'istalgan vaqtda oshirishi mumkin')).toBe(1);
  });

  it('counts a repeated string, which must be rejected', () => {
    expect(occurrences(document, "Ijara haqi oyiga 5 000 000 so'm.")).toBe(2);
  });

  it('returns 0 for text that is not there', () => {
    expect(occurrences(document, 'depozit')).toBe(0);
  });

  it('returns 0 for an empty needle instead of looping', () => {
    expect(occurrences(document, '')).toBe(0);
  });

  it('does not count overlapping matches twice', () => {
    expect(occurrences('aaaa', 'aa')).toBe(2);
  });
});
