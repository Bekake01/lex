/**
 * One implementation of hashing, in `@lex/crypto`, so the hash the certificate
 * records and the hash the summary job computes can never drift apart.
 */
export { canonicalJson, hashJson, sha256 } from '@lex/crypto';
