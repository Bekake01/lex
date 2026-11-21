import { parseSealRing } from '@lex/crypto';
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

/** Dev-only default for SIGN_TICKET_SECRET; boot fails if production uses it. */
const DEV_SIGN_TICKET_SECRET = 'dev-only-sign-ticket-secret-change-me-please';

const R2_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
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

    /** BullMQ. docker-compose starts redis on host port 6391. */
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),

    /** Signs access tokens (HS256). HS256 needs at least 256 bits of key. */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

    /**
     * Ed25519 seal key ring (JSON, same format as tech award's ESIGN_SEAL_KEYS):
     * seals every signed copy. Make one with `pnpm --filter api seal:keygen`.
     * Never delete an old key — mark it `retiring` so old seals still verify.
     */
    SEAL_KEYS: optionalSecret,
    /**
     * HMAC key for the signing password ticket (`x-sign-ticket`). The dev
     * default is refused in production.
     */
    SIGN_TICKET_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters')
      .default(DEV_SIGN_TICKET_SECRET),

    /* ------------------------------------------------------------------ AI -- */

    /** OpenAI (Responses API). Without it the AI jobs fail fast with AI_NOT_CONFIGURED. */
    OPENAI_API_KEY: optionalSecret,
    /** Any OpenAI reasoning model with structured outputs, e.g. gpt-5, gpt-5-mini. */
    AI_MODEL: z.string().default('gpt-5'),
    /**
     * The model for the simple calls — classify (triage + search queries) and
     * the recipient summaries. The review and the revise calls always use
     * `AI_MODEL`. Classify reads the whole document, so this is the biggest cost
     * lever there is. Set it to the same value as `AI_MODEL` to turn the split
     * off, which is how to tell whether it costs quality.
     */
    AI_MODEL_LIGHT: z.string().default('gpt-5-mini'),
    /** Effort for the review call. Summaries run one level lower (see ai.service). */
    AI_EFFORT: z
      .enum(['low', 'medium', 'high', 'xhigh', 'max'])
      .default('high'),
    /** Bumped whenever a prompt changes; old reviews keep their version. */
    AI_PROMPT_VERSION: z.string().default('v3'),

    /* ----------------------------------------------------------------- law -- */

    /**
     * Law search for the AI review. `auto` uses the law tables (LawModule) when
     * they hold data and the fixtures otherwise; `db` and `fake` force one side.
     */
    LAW_SEARCH_MODE: z.enum(['auto', 'fake', 'db']).default('auto'),

    /** Embeddings: Voyage voyage-3.5 (decided in Phase 7, docs/decisions/embeddings.md); needs VOYAGE_API_KEY. */
    EMBEDDING_PROVIDER: z.enum(['voyage', 'bge-m3']).default('voyage'),
    VOYAGE_API_KEY: z.string().min(1).optional(),
    EMBEDDING_URL: z.url().optional(),

    /** Daily lex.uz sync (Phase 14). Off unless explicitly enabled. */
    SYNC_ENABLED: booleanString,

    /* ------------------------------------------------------------- storage -- */

    /** `local` = disk under STORAGE_DIR (dev default), `r2` = Cloudflare R2. */
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    /** Directory for document bytes when STORAGE_DRIVER=local. */
    STORAGE_DIR: z.string().default('./uploads'),
    /** `https://<account-id>.r2.cloudflarestorage.com` — no bucket, no path. */
    S3_ENDPOINT: optionalSecret,
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: optionalSecret,
    S3_ACCESS_KEY_ID: optionalSecret,
    S3_SECRET_ACCESS_KEY: optionalSecret,
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
  })
  .superRefine((env, ctx) => {
    if (env.SEAL_KEYS) {
      try {
        parseSealRing(env.SEAL_KEYS);
      } catch {
        // Never echo the value: it holds private keys.
        ctx.addIssue({
          code: 'custom',
          path: ['SEAL_KEYS'],
          message: 'not a valid seal ring (run pnpm --filter api seal:keygen)',
        });
      }
    } else if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['SEAL_KEYS'],
        message: 'required in production',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.SIGN_TICKET_SECRET === DEV_SIGN_TICKET_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SIGN_TICKET_SECRET'],
        message: 'set a real secret in production',
      });
    }
    if (env.STORAGE_DRIVER !== 'r2') return;
    for (const key of R2_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'required when STORAGE_DRIVER=r2',
        });
      }
    }
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
