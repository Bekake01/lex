import { z, type ZodType } from 'zod';

/**
 * Keywords OpenAI strict structured outputs reject (string lengths, defaults).
 * Array sizes (minItems/maxItems) are supported and kept. Dropped limits are
 * still enforced: AiService validates every answer with the Zod schema.
 */
const DROPPED = ['$schema', 'minLength', 'maxLength', 'default'];

type JsonSchema = { [key: string]: unknown };

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (!node || typeof node !== 'object') return node;

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node as JsonSchema)) {
    if (DROPPED.includes(key)) continue;
    out[key] = walk(value);
  }
  // Strict mode: every object closed, every property required (absence is
  // modelled with nullable in the Zod schemas).
  if (
    out.type === 'object' &&
    out.properties &&
    typeof out.properties === 'object'
  ) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

/**
 * A Zod schema as JSON Schema that OpenAI's strict structured outputs accept:
 * objects closed and fully required, string length limits removed. Those
 * limits stay in force because AiService validates every answer with the
 * original Zod schema.
 */
export function strictJsonSchema(schema: ZodType): JsonSchema {
  return walk(
    z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }),
  ) as JsonSchema;
}
