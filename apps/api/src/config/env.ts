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

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  /** The sender dashboard; the only origin allowed by CORS. */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  /** Postgres with pgvector (docker-compose.yml at the repo root). */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),

  /** Signs access tokens (HS256). HS256 needs at least 256 bits of key. */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /** Embeddings, decided in Phase 7. */
  EMBEDDING_PROVIDER: z.enum(['voyage', 'bge-m3']).default('voyage'),
  VOYAGE_API_KEY: z.string().min(1).optional(),
  EMBEDDING_URL: z.url().optional(),

  /** Daily lex.uz sync (Phase 14). Off unless explicitly enabled. */
  SYNC_ENABLED: booleanString,
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
