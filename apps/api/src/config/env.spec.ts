import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://lex:lex@localhost:5434/lex',
  JWT_SECRET: 's'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.EMBEDDING_PROVIDER).toBe('voyage');
    expect(env.SYNC_ENABLED).toBe(false);
  });

  it('parses SYNC_ENABLED as a boolean', () => {
    expect(parseEnv({ ...valid, SYNC_ENABLED: 'true' }).SYNC_ENABLED).toBe(true);
  });

  it('names missing keys', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});
