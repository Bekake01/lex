import { parseEnv } from './env.js';

const valid = {
  LEX_API_KEY: 'k'.repeat(32),
  DATABASE_URL: 'postgres://lex:lex@localhost:5433/lex',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(5001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.EMBEDDING_PROVIDER).toBe('voyage');
    expect(env.SYNC_ENABLED).toBe(false);
  });

  it('parses SYNC_ENABLED as a boolean', () => {
    expect(parseEnv({ ...valid, SYNC_ENABLED: 'true' }).SYNC_ENABLED).toBe(true);
  });

  it('names missing keys', () => {
    expect(() => parseEnv({})).toThrow(/LEX_API_KEY[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*LEX_API_KEY/);
  });

  it('rejects a short API key without echoing it', () => {
    let message = '';
    try {
      parseEnv({ ...valid, LEX_API_KEY: 'short-secret' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/LEX_API_KEY/);
    expect(message).not.toContain('short-secret');
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});
