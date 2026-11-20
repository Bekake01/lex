import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/**
 * Where document bytes live. The rest of the app only ever sees opaque keys,
 * so swapping this for S3/R2 means adding a driver here and nothing else.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.STORAGE_DIR);
  }

  /** `documents/<documentId>/<filename>` — keys are generated, never user input. */
  buildKey(documentId: string, fileName: string): string {
    const safe = fileName.replace(/[^\w.-]+/g, '_').slice(-120) || 'file';
    return `documents/${documentId}/${safe}`;
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
