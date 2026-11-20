import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Request bodies of §3 of the build plan; shapes match src/contract.ts. */

export const docTypeSchema = z.enum(['rental', 'employment', 'sale', 'services', 'nda', 'other']);

export const searchRequestSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  docType: docTypeSchema.optional(),
  inForceOnly: z.boolean().default(true),
  limit: z.int().min(1).max(100).default(30),
});
export type SearchInput = z.infer<typeof searchRequestSchema>;

export const articlesBatchRequestSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
});

/** Parses a request body; a bad one is a 400 naming the fields, never echoing values. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new BadRequestException({
    error: 'VALIDATION',
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}
