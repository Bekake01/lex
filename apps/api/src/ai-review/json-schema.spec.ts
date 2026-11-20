import { describe, expect, it } from 'vitest';
import { strictJsonSchema } from './json-schema.js';
import {
  classifyOutputSchema,
  reviewOutputSchema,
  reviseOutputSchema,
  summaryOutputSchema,
} from './schemas.js';

type Node = Record<string, unknown>;

/** Every object node in a JSON Schema tree. */
function objects(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, out));
  else if (node && typeof node === 'object') {
    const n = node as Node;
    if (n.type === 'object') out.push(n);
    Object.values(n).forEach((v) => objects(v, out));
  }
  return out;
}

const keys = (node: unknown): string[] =>
  JSON.stringify(node)
    .match(/"(\w+)":/g)
    ?.map((k) => k.slice(1, -2)) ?? [];

describe('strictJsonSchema', () => {
  it.each([
    ['classify', classifyOutputSchema],
    ['review', reviewOutputSchema],
    ['revise', reviseOutputSchema],
    ['summary', summaryOutputSchema],
  ])(
    'makes the %s schema acceptable to OpenAI strict mode',
    (_name, schema) => {
      const json = strictJsonSchema(schema);
      const objs = objects(json);
      expect(objs.length).toBeGreaterThan(0);
      for (const o of objs) {
        // Closed, and every property required.
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as Node));
      }
      // String length limits are removed (enforced by Zod afterwards).
      expect(keys(json)).not.toContain('maxLength');
      expect(keys(json)).not.toContain('minLength');
      expect(keys(json)).not.toContain('$schema');
    },
  );

  it('keeps array size limits, enums, descriptions and null for absent values', () => {
    const json = JSON.stringify(strictJsonSchema(reviewOutputSchema));
    expect(json).toContain('"maxItems":40');
    expect(json).toContain('"enum":["low","medium","high"]');
    expect(json).toContain('"description"');
    // Absent values: `"type": ["string", "null"]`, the form strict mode documents.
    expect(json).toContain('"type":["string","null"]');
  });
});
