import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiUsageWireSchema,
  createSignatureRequestResponseSchema,
  documentVersionWireSchema,
  documentWireSchema,
  partyWireSchema,
  recipientSummaryWireSchema,
  reviewMessageWireSchema,
  reviewWireSchema,
  lockedViewSchema,
  openLinkInfoSchema,
  sendSigningResponseSchema,
  signerViewSchema,
  signingRequestDetailWireSchema,
  signingRequestListSchema,
} from '@lex/contracts';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

/**
 * The mock responses the frontend team builds against must stay valid against
 * the schemas in `ai.ts`. If a schema changes and a mock does not, this is
 * where it is caught — before the frontend finds out.
 */
const mocksDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/contracts/mocks',
);

const cases: [string, z.ZodType][] = [
  ['review-queued.json', reviewWireSchema],
  ['review-done.json', reviewWireSchema],
  ['review-failed.json', reviewWireSchema],
  ['review-messages.json', z.array(reviewMessageWireSchema)],
  ['message-pending.json', z.array(reviewMessageWireSchema)],
  ['parties.json', z.array(partyWireSchema)],
  ['versions.json', z.array(documentVersionWireSchema)],
  ['document.json', documentWireSchema],
  ['recipient-summary.json', recipientSummaryWireSchema],
  ['ai-usage.json', aiUsageWireSchema],
  ['signature-request-created.json', createSignatureRequestResponseSchema],
  ['signing-draft.json', signingRequestDetailWireSchema],
  ['signing-request-detail.json', signingRequestDetailWireSchema],
  ['signing-request-list.json', signingRequestListSchema],
  ['signing-send-response.json', sendSigningResponseSchema],
  ['signer-view.json', signerViewSchema],
  ['signer-view-locked.json', lockedViewSchema],
  ['open-link-info.json', openLinkInfoSchema],
];

describe('contract mocks', () => {
  for (const [file, schema] of cases) {
    it(`${file} matches its schema`, () => {
      const json = JSON.parse(readFileSync(join(mocksDir, file), 'utf8'));
      const result = schema.safeParse(json);
      expect(
        result.success
          ? []
          : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      ).toEqual([]);
    });
  }

  it('shows a finished review with a citation and one without', () => {
    const review = reviewWireSchema.parse(
      JSON.parse(readFileSync(join(mocksDir, 'review-done.json'), 'utf8')),
    );
    expect(review.issues.some((i) => i.citation !== null)).toBe(true);
    // "No supporting norm found" is a real state the frontend has to render.
    expect(review.issues.some((i) => i.citation === null)).toBe(true);
  });
});
