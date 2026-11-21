import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { StorageDriver } from './storage.driver.js';

/** Bytes on local disk under one root directory. The dev and test default. */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }

  /**
   * Rejects any key that would escape the storage root. Uses `relative()`
   * rather than a '/' prefix check, which rejected every key on Windows
   * (resolve() returns backslash paths there).
   */
  private pathFor(key: string): string {
    const path = resolve(join(this.root, key));
    const rel = relative(this.root, path);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}
