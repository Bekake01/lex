import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/**
 * argon2 password hashes (library defaults). Verifying against a missing hash
 * still runs argon2 on a dummy, so an unknown email (or an account with no
 * password yet) takes as long as a wrong password and the response time
 * doesn't reveal which accounts exist.
 */
export class PasswordHasher {
  // Same default argon2 parameters as real password hashes.
  private readonly dummyHash = hash(randomBytes(16).toString('hex'));

  hash(password: string): Promise<string> {
    return hash(password);
  }

  /** False when `storedHash` is null/undefined, after the same amount of work. */
  async verify(
    storedHash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    const ok = await verify(storedHash ?? (await this.dummyHash), password);
    return ok && storedHash != null;
  }
}
