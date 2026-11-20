import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseEnv } from '../config/env.js';
import { ApiKeyGuard } from './api-key.guard.js';

const KEY = 'a'.repeat(40);
const env = parseEnv({ LEX_API_KEY: KEY, DATABASE_URL: 'postgres://x@y/z' });

function contextWith(headers: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const reflector = new Reflector();
  const guard = new ApiKeyGuard(reflector, env);

  afterEach(() => vi.restoreAllMocks());

  it('allows the correct key', () => {
    expect(guard.canActivate(contextWith({ 'x-lex-api-key': KEY }))).toBe(true);
  });

  it.each([
    ['missing', {}],
    ['empty', { 'x-lex-api-key': '' }],
    ['wrong', { 'x-lex-api-key': 'b'.repeat(40) }],
    ['prefix of the key', { 'x-lex-api-key': KEY.slice(0, 10) }],
    ['array header', { 'x-lex-api-key': [KEY, KEY] }],
  ])('rejects a %s key', (_label, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it('skips the check for @Public routes', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(contextWith({}))).toBe(true);
  });
});
