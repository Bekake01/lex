import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { AI_ERROR, AiError, toAiError } from './ai-errors.js';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export interface StructuredCall<T> {
  /** Short name for logs and metrics, e.g. `classify`. Never prompt text. */
  label: string;
  /**
   * Stable, cacheable instructions. The last block gets the cache breakpoint,
   * so keep volatile content out of here and put it in `content`.
   */
  system: string[];
  /** Volatile content: the document and the retrieved articles. */
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  output: T;
  usage: AiUsageTotals;
  model: string;
}

/** USD per million tokens. Unknown models fall back to Opus 5.5 pricing. */
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/**
 * The one place that talks to Claude.
 *
 * Every call is a structured-output call: a Zod schema goes in, a validated
 * object comes out, and the raw message never leaves this class. Requests are
 * streamed because a contract plus ~30 retrieved articles makes for long
 * input, and `stop_reason` is always checked before any content is read.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  readonly model: string;
  readonly defaultEffort: Effort;
  readonly promptVersion: string;

  constructor(@Inject(ENV) env: Env) {
    this.model = env.AI_MODEL;
    this.defaultEffort = env.AI_EFFORT;
    this.promptVersion = env.AI_PROMPT_VERSION;
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** A PDF sent to Claude as a native document block (no text layer needed). */
  static documentBlock(
    bytes: Uint8Array,
    contentType: string,
  ): Anthropic.Beta.BetaContentBlockParam {
    if (contentType !== 'application/pdf') {
      throw new AiError(
        'Only PDF can be sent to Claude as a document',
        AI_ERROR.badRequest,
        false,
      );
    }
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from(bytes).toString('base64'),
      },
    };
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const client = this.client;
    if (!client) {
      throw new AiError(
        'ANTHROPIC_API_KEY is not set',
        AI_ERROR.notConfigured,
        false,
      );
    }

    // Cache breakpoint on the last system block: the instructions and
    // checklists are identical across documents, the document is not.
    const system: Anthropic.Beta.BetaTextBlockParam[] = call.system.map(
      (text, i) => ({
        type: 'text',
        text,
        ...(i === call.system.length - 1
          ? { cache_control: { type: 'ephemeral' as const } }
          : {}),
      }),
    );

    const started = Date.now();
    try {
      const stream = client.beta.messages.stream({
        model: this.model,
        max_tokens: call.maxTokens ?? 32_000,
        // Thinking is always on for Opus 5.5; effort is the depth control.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: call.effort ?? this.defaultEffort,
          format: betaZodOutputFormat(call.schema),
        },
        // A safety decline re-runs the same request on a fallback model inside
        // the same call instead of failing the job.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: call.content }],
      });

      const message = await stream.finalMessage();
      const usage = this.priceUsage(message.usage, message.model);

      this.logger.log(
        [
          `${call.label}: ${message.stop_reason}`,
          `${Date.now() - started}ms`,
          `${usage.inputTokens} in / ${usage.outputTokens} out`,
          `cache read ${usage.cacheReadTokens}`,
          `cost ${usage.costUsd.toFixed(4)} USD`,
        ].join(', '),
      );

      if (message.stop_reason === 'refusal') {
        throw new AiError(
          'Claude declined to process this document',
          AI_ERROR.refusal,
          false,
        );
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AiError(
          'The answer did not fit in the output limit',
          AI_ERROR.truncated,
          false,
        );
      }
      if (!message.parsed_output) {
        throw new AiError(
          'Claude returned an answer that did not match the schema',
          AI_ERROR.unparsable,
          false,
        );
      }

      return { output: message.parsed_output, usage, model: message.model };
    } catch (error) {
      const aiError = toAiError(error);
      // Code and retryability only: no prompt, no document text, no key.
      this.logger.warn(
        `${call.label} failed: ${aiError.code} (retryable=${aiError.retryable})`,
      );
      throw aiError;
    }
  }

  private priceUsage(
    usage: Anthropic.Beta.BetaUsage,
    model: string,
  ): AiUsageTotals {
    const price = PRICES[model] ?? PRICES['claude-opus-5-5'];
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const costUsd =
      (inputTokens * price.input +
        // Writing to the cache costs about 1.25x the input rate.
        cacheCreationTokens * price.input * 1.25 +
        cacheReadTokens * price.cacheRead +
        outputTokens * price.output) /
      1_000_000;
    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
    };
  }
}

export function emptyUsage(): AiUsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
  };
}

export function addUsage(a: AiUsageTotals, b: AiUsageTotals): AiUsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}
