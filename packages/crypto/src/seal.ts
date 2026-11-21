import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from './hash.js';

/**
 * The document-sealing keyring — the tamper-evidence half of the e-signature
 * proof. Ported from tech award (tms-platform's audited SealService);
 * framework-free so the API and its jobs can construct it.
 *
 * What a seal claims: "this server, holding key <kid>, asserts that the signed
 * copy of <recipientId> in send <requestId> hashed to <signedHash> at
 * <signedAt>, made from the original <documentHash> after the signer was shown
 * the summary <summaryHash>." It does NOT claim who signed — that is the
 * certificate's job. Together they are the evidence package.
 *
 * Ed25519 via node:crypto sign(null, ...): Ed25519 hashes internally, so the
 * digest-algorithm argument is null (passing 'sha256' throws).
 *
 * Every listed key VERIFIES; only the `active` key SIGNS. Seal keys are
 * LONG-LIVED and must never be deleted — a seal from years ago must keep
 * verifying after its key stops signing new ones. They are separate from
 * short-lived auth keys by design.
 */

/** What a seal is bound to — one person's signing event, not merely the bytes. */
export interface SealPayload {
  requestId: string;
  recipientId: string;
  signedAt: Date;
  /** sha256 hex of this person's signed (stamped) PDF. */
  signedHash: string;
  /** sha256 hex of the original PDF that was sent. */
  documentHash: string;
  /** sha256 of the summary shown to the signer; null when none was shown. */
  summaryHash: string | null;
}

export const sealKeySchema = z.object({
  kid: z.string().min(1),
  privateKeyPkcs8Pem: z.string().includes('PRIVATE KEY'),
  state: z.enum(['active', 'retiring']),
  // Optional metadata (kept for tms-ring compatibility); not used in signing.
  createdAt: z.string().optional(),
});
export type SealKey = z.infer<typeof sealKeySchema>;

export const sealRingSchema = z
  .array(sealKeySchema)
  .min(1, 'seal ring must contain at least one key')
  .refine((keys) => keys.filter((k) => k.state === 'active').length === 1, {
    message: 'seal ring must contain exactly one "active" key',
  })
  .refine((keys) => new Set(keys.map((k) => k.kid)).size === keys.length, {
    message: 'seal ring kids must be unique',
  });

/** Parse + validate a JSON seal ring from env. Throws (fail closed) on any problem. */
export function parseSealRing(json: string): SealKey[] {
  return sealRingSchema.parse(JSON.parse(json));
}

export class SealService {
  private readonly entries = new Map<string, { privateKey: KeyObject; publicKey: KeyObject }>();
  private readonly activeKid: string;

  constructor(ring: SealKey[]) {
    // Re-checked here (not only in the zod schema) so a hand-built ring — every
    // unit spec constructs one — also fails closed instead of last-wins.
    let activeKid: string | undefined;
    for (const entry of ring) {
      if (this.entries.has(entry.kid)) {
        throw new Error(`seal ring: duplicate kid "${entry.kid}"`);
      }
      const privateKey = createPrivateKey(entry.privateKeyPkcs8Pem);
      // Fail closed at boot on a wrong key type — otherwise a misconfigured
      // RSA/EC key is accepted here and only blows up at seal() time (and the
      // certificate would mislabel the algorithm). Ed25519 is the contract.
      if (privateKey.asymmetricKeyType !== 'ed25519') {
        throw new Error(`seal ring: key "${entry.kid}" is not Ed25519`);
      }
      this.entries.set(entry.kid, {
        privateKey,
        // Derived from the private half — one fewer secret-adjacent input to get wrong.
        publicKey: createPublicKey(privateKey),
      });
      if (entry.state === 'active') {
        if (activeKid !== undefined) throw new Error('seal ring: more than one "active" key');
        activeKid = entry.kid;
      }
    }
    if (!activeKid) throw new Error('seal ring: no "active" key');
    this.activeKid = activeKid;
  }

  /**
   * Seal a completed signing. The seal covers the request, recipient and
   * signing time, not just the hash, so the {signedHash, signature, kid}
   * triple cannot be lifted onto a different copy and still verify.
   */
  seal(payload: SealPayload): { signature: string; kid: string } {
    const entry = this.entries.get(this.activeKid);
    if (!entry) throw new Error('seal ring: active key missing');
    const signature = sign(null, canonicalBytes(payload), entry.privateKey);
    return { signature: signature.toString('base64'), kid: this.activeKid };
  }

  /**
   * Check a stored seal against the request it claims to belong to. Returns
   * false — never throws — for an unknown kid or malformed signature: this
   * answers a yes/no evidentiary question and "no" is a real answer.
   */
  verify(payload: SealPayload, signatureBase64: string, kid: string): boolean {
    const entry = this.entries.get(kid);
    if (!entry) return false;
    try {
      return verify(
        null,
        canonicalBytes(payload),
        entry.publicKey,
        Buffer.from(signatureBase64, 'base64'),
      );
    } catch {
      return false;
    }
  }
}

/**
 * The exact bytes signed/verified: a version prefix, then the canonical JSON
 * of the payload (sorted keys), so the format is unambiguous and can evolve
 * (`lex-seal-v2|...`).
 */
function canonicalBytes(p: SealPayload): Buffer {
  return Buffer.from(
    `lex-seal-v1|${canonicalJson({
      requestId: p.requestId,
      recipientId: p.recipientId,
      signedAt: p.signedAt.toISOString(),
      signedHash: p.signedHash,
      documentHash: p.documentHash,
      summaryHash: p.summaryHash,
    })}`,
    'utf8',
  );
}

/** A fresh one-key ring (JSON for `SEAL_KEYS`). Used by `pnpm seal:keygen`. */
export function generateSealRing(kid: string): SealKey[] {
  const { privateKey } = generateKeyPairSync('ed25519');
  return [
    {
      kid,
      privateKeyPkcs8Pem: privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      state: 'active',
      createdAt: new Date().toISOString(),
    },
  ];
}
