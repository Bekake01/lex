/** The Postgres advisory lock key for the lex.uz sync (any constant number; unique in this app). */
export const LEXUZ_SYNC_LOCK = 7_201_514;

/** The part of a pg client the lock needs (a real `pg.Client`, or a fake in tests). */
export interface LockClient {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Runs `fn` only if this process gets the Postgres advisory lock `key`, so
 * that with several API instances only one runs the nightly sync. Returns
 * null (and does nothing) when another instance holds it. The lock belongs to
 * the client's session, so it must be one dedicated connection, not a pool.
 */
export async function withAdvisoryLock<T>(client: LockClient, key: number, fn: () => Promise<T>): Promise<T | null> {
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
  if (rows[0]?.locked !== true) return null;
  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [key]);
  }
}
