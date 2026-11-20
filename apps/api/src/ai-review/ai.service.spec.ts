import { describe, expect, it } from 'vitest';
import { AI_ERROR, AiError } from './ai-errors.js';
import { AiService, priceUsage } from './ai.service.js';

/**
 * What can be checked without spending a token: the shape of a document block,
 * and the arithmetic behind every `ai_usage` row. The request mapping itself
 * (`input_file`, `json_schema`) is typed against the SDK, so a wrong field name
 * is a compile error rather than something a test could catch.
 */
describe('document blocks', () => {
  const bytes = new TextEncoder().encode('%PDF-1.7 fake');

  it('sends a PDF to the model as a file', () => {
    const block = AiService.documentBlock(bytes, 'application/pdf');

    expect(block).toEqual({
      type: 'pdf',
      data: Buffer.from(bytes).toString('base64'),
      filename: 'contract.pdf',
    });
  });

  it('refuses any other type, because only PDF can be sent as a file', () => {
    // A DOCX reaches the model as extracted text; if extraction gave nothing,
    // failing here is better than sending bytes the model cannot read.
    const docx =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    try {
      AiService.documentBlock(bytes, docx);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe(AI_ERROR.badRequest);
      expect((error as AiError).retryable).toBe(false);
    }
  });
});

describe('priceUsage', () => {
  /** `input_tokens` includes the cached ones; billing them twice is the bug. */
  it('splits cached tokens out of the input count', () => {
    const usage = priceUsage(
      {
        input_tokens: 10_000,
        input_tokens_details: { cached_tokens: 8_000, cache_write_tokens: 0 },
        output_tokens: 1_000,
        output_tokens_details: { reasoning_tokens: 400 },
        total_tokens: 11_000,
      },
      'gpt-5',
    );

    expect(usage.inputTokens).toBe(2_000);
    expect(usage.cacheReadTokens).toBe(8_000);
    expect(usage.outputTokens).toBe(1_000);
    // 2000 × 1.25 + 8000 × 0.125 + 1000 × 10, per million.
    expect(usage.costUsd).toBeCloseTo(0.0135, 6);
    // OpenAI caches automatically and charges nothing to write.
    expect(usage.cacheCreationTokens).toBe(0);
  });

  it('prices a dated snapshot at its base model, and the cheap model cheaper', () => {
    const usage = (model: string) =>
      priceUsage(
        {
          input_tokens: 1_000_000,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 0,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 1_000_000,
        },
        model,
      ).costUsd;

    expect(usage('gpt-5-2025-08-07')).toBeCloseTo(1.25, 6);
    expect(usage('gpt-5-mini-2025-08-07')).toBeCloseTo(0.25, 6);
    expect(usage('gpt-5-nano')).toBeCloseTo(0.05, 6);
    // An unpriced model is estimated at the full model's price rather than 0,
    // so a new model never looks free in `ai_usage`.
    expect(usage('gpt-6-turbo')).toBeCloseTo(1.25, 6);
  });

  it('reports zeros when the API sent no usage', () => {
    expect(priceUsage(undefined, 'gpt-5')).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
    });
  });
});
