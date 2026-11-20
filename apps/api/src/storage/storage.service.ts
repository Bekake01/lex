import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { R2StorageDriver } from './r2-storage.driver.js';
import type { StorageDriver } from './storage.driver.js';

/**
 * Where file bytes live: local disk (`STORAGE_DRIVER=local`, the default) or
 * Cloudflare R2 (`r2`). The rest of the app only ever sees opaque keys.
 *
 * Keys (generated, never user input):
 *   documents/<documentId>/<file>                 uploaded documents
 *   signatures/<requestId>/<recipientId>.png      adopted signature image
 *   signed/<requestId>/<recipientId>.pdf          one person's sealed copy
 *   certificates/<requestId>/<recipientId>.pdf    its certificate
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor(@Inject(ENV) env: Env) {
    if (env.STORAGE_DRIVER === 'r2') {
      // env.ts guarantees all four are set when the driver is r2.
      this.driver = new R2StorageDriver({
        endpoint: env.S3_ENDPOINT!,
        region: env.S3_REGION ?? 'auto',
        bucket: env.S3_BUCKET!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      });
      this.logger.log(`storage: R2 bucket ${env.S3_BUCKET}`);
    } else {
      this.driver = new LocalStorageDriver(env.STORAGE_DIR);
    }
  }

  /** `documents/<documentId>/<filename>` — keys are generated, never user input. */
  buildKey(documentId: string, fileName: string): string {
    const safe = fileName.replace(/[^\w.-]+/g, '_').slice(-120) || 'file';
    return `documents/${documentId}/${safe}`;
  }

  put(key: string, bytes: Uint8Array, contentType?: string): Promise<void> {
    return this.driver.put(key, bytes, contentType);
  }

  get(key: string): Promise<Uint8Array> {
    return this.driver.get(key);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }
}
