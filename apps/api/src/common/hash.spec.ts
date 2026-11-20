import { describe, expect, it } from 'vitest';
import { canonicalJson, hashJson, sha256 } from './hash.js';

describe('canonicalJson', () => {
  it('sorts keys at every depth so the hash is stable', () => {
    const a = { b: 1, a: { d: [{ y: 2, x: 1 }], c: 3 } };
    const b = { a: { c: 3, d: [{ x: 1, y: 2 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashJson(a)).toBe(hashJson(b));
  });

  it('drops undefined values rather than hashing their position', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('keeps array order, which is meaningful', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });
});

describe('sha256', () => {
  it('matches the known digest of the empty string', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
