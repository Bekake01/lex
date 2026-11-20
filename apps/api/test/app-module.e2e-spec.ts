import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiService } from '../src/ai-review/ai.service.js';
import { ReviewService } from '../src/ai-review/review.service.js';
import { AppModule } from '../src/app.module.js';
import { EditsService } from '../src/ai-review/edits.service.js';
import { SigningService } from '../src/signing/signing.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import {
  LAW_SEARCH,
  DOC_PROCESSING,
} from '../src/law-search/law-search.types.js';
import type { TestingModule } from '@nestjs/testing';

/**
 * Wiring check: every provider the AI routes and jobs need must resolve from
 * the real `AppModule`. Needs Postgres and Redis running (`pnpm services:up`),
 * which is why it lives with the e2e specs.
 */
describe('AppModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('resolves the AI services', () => {
    expect(moduleRef.get(AiService)).toBeInstanceOf(AiService);
    expect(moduleRef.get(ReviewService)).toBeInstanceOf(ReviewService);
    expect(moduleRef.get(EditsService)).toBeInstanceOf(EditsService);
    expect(moduleRef.get(SigningService)).toBeInstanceOf(SigningService);
    expect(moduleRef.get(AiUsageService)).toBeInstanceOf(AiUsageService);
  });

  it('resolves the law-search seam', () => {
    expect(moduleRef.get(LAW_SEARCH)).toBeTruthy();
    expect(moduleRef.get(DOC_PROCESSING)).toBeTruthy();
  });
});
