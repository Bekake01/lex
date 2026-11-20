import { z } from 'zod';

/**
 * The only place the api reads process.env. Everything else injects `ENV`.
 * The app refuses to boot on a bad environment and names the offending keys
 * (never their values).
 */
const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/**
 * A secret that may be absent. `.env.example` ships these keys empty, and an
 * empty value means "not set", not "set to the empty string".
 */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /** The sender dashboard; the only origin allowed by CORS. */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  /** Public base URL of apps/sign, used to build signing links. */
  SIGN_APP_URL: z.string().default('http://localhost:3001'),

  /** Postgres with pgvector (docker-compose.yml at the repo root). */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),

  /** BullMQ. docker-compose starts redis on 6379. */
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),

  /** Signs access tokens (HS256). HS256 needs at least 256 bits of key. */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /* ------------------------------------------------------------------ AI -- */

  ANTHROPIC_API_KEY: optionalSecret,
  AI_MODEL: z.string().default('claude-opus-5-5'),
  /** Effort for the review call. Summaries run one level lower (see ai.service). */
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  /** Bumped whenever a prompt changes; old reviews keep their version. */
  AI_PROMPT_VERSION: z.string().default('v1'),

  /* ----------------------------------------------------------------- law -- */

  /**
   * Law search for the AI review. `auto` uses the law tables (LawModule) when
   * they hold data and the fixtures otherwise; `db` and `fake` force one side.
   */
  LAW_SEARCH_MODE: z.enum(['auto', 'fake', 'db']).default('auto'),

  /** Embeddings, decided in Phase 7. */
  EMBEDDING_PROVIDER: z.enum(['voyage', 'bge-m3']).default('voyage'),
  VOYAGE_API_KEY: z.string().min(1).optional(),
  EMBEDDING_URL: z.url().optional(),

  /** Daily lex.uz sync (Phase 14). Off unless explicitly enabled. */
  SYNC_ENABLED: booleanString,

  /* ------------------------------------------------------------- storage -- */

  /** Directory for document bytes. Swap for S3/R2 behind StorageService later. */
  STORAGE_DIR: z.string().default('./uploads'),
  /** Upload limit in bytes (20 MB). */
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),

  /* -------------------------------------------------------- plan limits -- */

  /** Monthly AI reviews for an individual user. 0 = unlimited. */
  AI_REVIEWS_LIMIT_PERSONAL: z.coerce.number().int().min(0).default(20),
  /** Monthly AI reviews pooled across an agency. 0 = unlimited. */
  AI_REVIEWS_LIMIT_AGENCY: z.coerce.number().int().min(0).default(200),
  /** How long the invite job waits for recipient summaries before sending without them. */
  SUMMARY_WAIT_MS: z.coerce.number().int().min(0).default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return result.data;
}
