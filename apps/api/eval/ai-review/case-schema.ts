import { contractTypeSchema } from '@lex/contracts';
import { z } from 'zod';

/**
 * What a committed eval case must look like.
 *
 * The set grows to 30–50 contracts marked by different people, so a malformed
 * file has to name itself instead of becoming a mysterious zero in the report.
 */
export const expectedIssueSchema = z.object({
  clauseRef: z.string().min(1),
  anyOf: z.array(z.string().min(2)).min(1),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  expectCitationFrom: z.string().min(1).optional(),
});

export const evalCaseSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z]+-\d{2,}$/, 'id looks like "rental-07": type, dash, number'),
  notes: z.string().optional(),
  docType: contractTypeSchema,
  language: z.enum(['uz', 'ru', 'en']),
  // Shorter than this is not a contract, and the review has nothing to find.
  text: z.string().min(200),
  expectedIssues: z.array(expectedIssueSchema),
});

/**
 * Personal data that anonymising usually misses. Warnings, not errors: a
 * contract is full of numbers, and only a human can tell a rent amount from a
 * passport number.
 */
const SMELLS: { what: string; pattern: RegExp }[] = [
  {
    what: 'a phone number',
    pattern: /(?:\+998|\b998)[\s(-]?\d{2}[\s)-]?\d{3}/,
  },
  { what: 'a passport number', pattern: /\b[A-Z]{2}\s?\d{7}\b/ },
  { what: 'an INN or PINFL', pattern: /\b\d{9}\b|\b\d{14}\b/ },
  { what: 'a bank account', pattern: /\b\d{20}\b/ },
  { what: 'an email address', pattern: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
];

export function anonymisationWarnings(text: string): string[] {
  return SMELLS.filter(({ pattern }) => pattern.test(text)).map(
    ({ what }) => what,
  );
}

/** A parsed case, or the reason the file cannot be used, naming the file. */
export function parseCase(
  file: string,
  raw: unknown,
):
  | { ok: true; value: z.infer<typeof evalCaseSchema>; warnings: string[] }
  | { ok: false; problem: string } {
  const parsed = evalCaseSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, problem: `${file}: ${problems}` };
  }
  return {
    ok: true,
    value: parsed.data,
    warnings: anonymisationWarnings(parsed.data.text),
  };
}
