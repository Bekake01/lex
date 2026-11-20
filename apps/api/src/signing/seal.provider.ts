import { parseSealRing, SealService } from '@lex/crypto';
import type { Provider } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** The seal key ring, or null when `SEAL_KEYS` is not set (dev without keys). */
export const SEAL = Symbol('SEAL');

export const sealProvider: Provider = {
  provide: SEAL,
  inject: [ENV],
  useFactory: (env: Env): SealService | null =>
    env.SEAL_KEYS ? new SealService(parseSealRing(env.SEAL_KEYS)) : null,
};
