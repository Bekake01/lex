/**
 * `pnpm --filter api seal:keygen` — print a fresh one-key seal ring for
 * `SEAL_KEYS`. To rotate: mark the old key `"state": "retiring"`, add the new
 * one as `active`, and keep both forever (old seals must keep verifying).
 */
import { generateSealRing } from '@lex/crypto';

const kid = `seal-${new Date().toISOString().slice(0, 10)}`;
const ring = generateSealRing(kid);

console.log(`SEAL_KEYS='${JSON.stringify(ring)}'`);
console.error(`\n↑ paste into apps/api/.env (kid ${kid}). Keep it secret; never delete it.`);
