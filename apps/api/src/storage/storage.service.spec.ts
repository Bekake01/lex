import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { StorageService } from './storage.service.js';

describe('StorageService', () => {
  let dir: string;
  let storage: StorageService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lex-storage-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips bytes', async () => {
    const key = storage.buildKey('doc-1', 'contract.pdf');
    await storage.put(key, new TextEncoder().encode('hello'));
    expect(new TextDecoder().decode(await storage.get(key))).toBe('hello');
  });

  it('strips path separators out of file names', () => {
    expect(storage.buildKey('doc-1', '../../etc/passwd')).toBe(
      'documents/doc-1/.._.._etc_passwd',
    );
  });

  it('refuses a key that escapes the storage root', async () => {
    await expect(storage.get('../../../etc/passwd')).rejects.toThrow(
      'Invalid storage key',
    );
  });
});
