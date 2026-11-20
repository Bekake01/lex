import { createHash } from 'node:crypto';

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Deterministic JSON: object keys sorted at every depth and `undefined`
 * dropped, so the same data always produces the same bytes and therefore the
 * same hash. Array order is kept, because it is meaningful.
 *
 * This is what makes `summaryHash` provable: the stored summary can be
 * re-hashed years later and compared with the hash in the certificate.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashJson(value: unknown): string {
  return sha256(canonicalJson(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = sortKeys(source[key]);
    }
    return out;
  }
  return value;
}
