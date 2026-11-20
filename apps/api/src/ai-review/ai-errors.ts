import OpenAI from 'openai';

/**
 * Everything the AI layer throws. `retryable` is what the BullMQ processors
 * branch on: rate limits and overloaded/5xx errors are worth another attempt,
 * a 400 or a refusal is not.
 *
 * The message is always safe to store and log: it never contains a prompt,
 * model output, document text or an API key.
 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export const AI_ERROR = {
  notConfigured: 'AI_NOT_CONFIGURED',
  refusal: 'AI_REFUSAL',
  truncated: 'AI_TRUNCATED',
  unparsable: 'AI_UNPARSABLE',
  rateLimited: 'AI_RATE_LIMITED',
  overloaded: 'AI_OVERLOADED',
  badRequest: 'AI_BAD_REQUEST',
  connection: 'AI_CONNECTION',
  unknown: 'AI_UNKNOWN',
} as const;

/** Maps an SDK error onto our retry decision, most specific class first. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  if (error instanceof OpenAI.RateLimitError) {
    // 429 is also "quota exhausted"; retrying that is harmless and short.
    return new AiError('AI rate limit reached', AI_ERROR.rateLimited, true);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AiError('Could not reach the AI service', AI_ERROR.connection, true);
  }
  if (error instanceof OpenAI.NotFoundError) {
    return new AiError('AI model not found', AI_ERROR.badRequest, false);
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiError('The AI service rejected the API key', AI_ERROR.badRequest, false);
  }
  if (error instanceof OpenAI.BadRequestError) {
    return new AiError('The AI service rejected the request', AI_ERROR.badRequest, false);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    const retryable = status === 408 || status === 409 || status >= 500;
    return new AiError(
      `The AI service returned ${status || 'an error'}`,
      retryable ? AI_ERROR.overloaded : AI_ERROR.badRequest,
      retryable,
    );
  }

  return new AiError('Unexpected AI failure', AI_ERROR.unknown, false);
}
