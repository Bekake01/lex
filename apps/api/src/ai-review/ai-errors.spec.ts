import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { AI_ERROR, AiError, toAiError } from './ai-errors.js';

/** The retry decision each job depends on. */
describe('toAiError', () => {
  it('retries a rate limit', () => {
    const error = toAiError(
      new OpenAI.RateLimitError(429, undefined, 'slow down', new Headers()),
    );
    expect(error.code).toBe(AI_ERROR.rateLimited);
    expect(error.retryable).toBe(true);
  });

  it('does not retry an account without credit', () => {
    const error = toAiError(
      new OpenAI.RateLimitError(
        429,
        { code: 'insufficient_quota', type: 'insufficient_quota' },
        'no credit',
        new Headers(),
      ),
    );
    expect(error.code).toBe(AI_ERROR.quotaExhausted);
    expect(error.retryable).toBe(false);
  });

  it('retries a connection failure', () => {
    const error = toAiError(
      new OpenAI.APIConnectionError({ message: 'socket' }),
    );
    expect(error.retryable).toBe(true);
  });

  it('does not retry a 400', () => {
    const error = toAiError(
      new OpenAI.BadRequestError(400, undefined, 'bad', new Headers()),
    );
    expect(error.code).toBe(AI_ERROR.badRequest);
    expect(error.retryable).toBe(false);
  });

  it('retries a 500', () => {
    const error = toAiError(
      new OpenAI.InternalServerError(
        503,
        undefined,
        'overloaded',
        new Headers(),
      ),
    );
    expect(error.retryable).toBe(true);
  });

  it('passes our own errors through unchanged', () => {
    const own = new AiError('declined', AI_ERROR.refusal, false);
    expect(toAiError(own)).toBe(own);
  });

  it('treats anything unexpected as non-retryable', () => {
    expect(toAiError(new Error('oops')).retryable).toBe(false);
  });
});
