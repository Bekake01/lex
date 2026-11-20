import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ZodType } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { AI_ERROR, AiError, toAiError } from './ai-errors.js';
import { strictJsonSchema } from './json-schema.js';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiUsageTotals {
  /** Input tokens billed at the full rate (cached ones are counted separately). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Always 0 with OpenAI: caching is automatic and writing to it is free. */
  cacheCreationTokens: number;
  costUsd: number;
}

/**
 * Provider-neutral input blocks. The job processors build these; AiService
 * turns them into the provider's format.
 */
export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'pdf'; data: string; filename: string };

export interface StructuredCall<T> {
  /** Short name for logs and metrics, e.g. `classify`. Never prompt text. */
  label: string;
  /**
   * Stable instructions, sent first. OpenAI caches the longest repeated
   * prefix automatically, so keep volatile content out of here.
   */
  system: string[];
  /** Volatile content: the document and the retrieved articles. */
  content: AiContentBlock[];
  schema: ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  output: T;
  usage: AiUsageTotals;
  model: string;
}

/** USD per million tokens. Unknown models are priced as gpt-5 (an estimate). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.005 },
};

/** "gpt-5-2025-08-07" → "gpt-5": the response reports a dated snapshot name. */
function priceFor(model: string) {
  const base = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((name) => model === name || model.startsWith(`${name}-2`));
  return PRICES[base ?? 'gpt-5'];
}

/**
 * The one place that talks to the language model (OpenAI, Responses API).
 *
 * Every call is a structured-output call: a Zod schema goes in, a validated
 * object comes out, and the raw response never leaves this class. The schema
 * is sent as strict JSON Schema, and the answer is validated again with Zod
 * here, because length limits are enforced locally, not by the API.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  readonly model: string;
  readonly defaultEffort: Effort;
  readonly promptVersion: string;

  constructor(@Inject(ENV) env: Env) {
    this.model = env.AI_MODEL;
    this.defaultEffort = env.AI_EFFORT;
    this.promptVersion = env.AI_PROMPT_VERSION;
    this.client = env.OPENAI_API_KEY
      ? // Long contracts plus ~30 articles can take a while at high effort.
        new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 10 * 60 * 1000, maxRetries: 0 })
      : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** A PDF sent to the model as a file (no text layer needed). */
  static documentBlock(bytes: Uint8Array, contentType: string): AiContentBlock {
    if (contentType !== 'application/pdf') {
      throw new AiError('Only PDF can be sent to the model as a document', AI_ERROR.badRequest, false);
    }
    return { type: 'pdf', data: Buffer.from(bytes).toString('base64'), filename: 'contract.pdf' };
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const client = this.client;
    if (!client) {
      throw new AiError('OPENAI_API_KEY is not set', AI_ERROR.notConfigured, false);
    }

    const started = Date.now();
    try {
      const response = await client.responses.create({
        model: this.model,
        instructions: call.system.join('\n\n'),
        input: [
          {
            role: 'user',
            content: call.content.map((block) =>
              block.type === 'text'
                ? { type: 'input_text' as const, text: block.text }
                : {
                    type: 'input_file' as const,
                    filename: block.filename,
                    file_data: `data:application/pdf;base64,${block.data}`,
                  },
            ),
          },
        ],
        reasoning: { effort: call.effort ?? this.defaultEffort },
        max_output_tokens: call.maxTokens ?? 32_000,
        text: {
          format: {
            type: 'json_schema',
            name: call.label.replace(/[^\w-]/g, '_').slice(0, 64) || 'output',
            schema: strictJsonSchema(call.schema),
            strict: true,
          },
        },
        // Same label → same cache shard, so repeated instructions hit the cache.
        prompt_cache_key: `lex-${call.label}`,
        // No prompt or document is kept on OpenAI's side for later retrieval.
        store: false,
      });

      const usage = this.priceUsage(response.usage, response.model);
      this.logger.log(
        [
          `${call.label}: ${response.status}`,
          `${Date.now() - started}ms`,
          `${usage.inputTokens + usage.cacheReadTokens} in / ${usage.outputTokens} out`,
          `cache read ${usage.cacheReadTokens}`,
          `cost ${usage.costUsd.toFixed(4)} USD`,
        ].join(', '),
      );

      const refused = response.output.some(
        (item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'),
      );
      if (refused || response.incomplete_details?.reason === 'content_filter') {
        throw new AiError('The model declined to process this document', AI_ERROR.refusal, false);
      }
      if (response.status === 'incomplete') {
        throw new AiError('The answer did not fit in the output limit', AI_ERROR.truncated, false);
      }

      let raw: unknown;
      try {
        raw = JSON.parse(response.output_text);
      } catch {
        raw = undefined;
      }
      const parsed = call.schema.safeParse(raw);
      if (!parsed.success) {
        throw new AiError('The model returned an answer that did not match the schema', AI_ERROR.unparsable, false);
      }

      return { output: parsed.data, usage, model: response.model };
    } catch (error) {
      const aiError = toAiError(error);
      // Code and retryability only: no prompt, no document text, no key.
      this.logger.warn(`${call.label} failed: ${aiError.code} (retryable=${aiError.retryable})`);
      throw aiError;
    }
  }

  private priceUsage(usage: OpenAI.Responses.ResponseUsage | undefined, model: string): AiUsageTotals {
    const price = priceFor(model);
    // OpenAI's input_tokens includes the cached ones; split them out.
    const cacheReadTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    const inputTokens = Math.max(0, (usage?.input_tokens ?? 0) - cacheReadTokens);
    const outputTokens = usage?.output_tokens ?? 0;
    const costUsd =
      (inputTokens * price.input + cacheReadTokens * price.cacheRead + outputTokens * price.output) / 1_000_000;
    return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: 0, costUsd };
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
