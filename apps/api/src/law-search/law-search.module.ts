import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { FakeDocProcessingService } from './fake-doc-processing.service.js';
import { FakeLawSearchService } from './fake-law-search.service.js';
import { DOC_PROCESSING, LAW_SEARCH } from './law-search.types.js';
import { LexApiClient } from './lex-api.client.js';

/**
 * Picks A's real service or the fixtures. `LAW_SEARCH_MODE=auto` (the default)
 * uses lex-api as soon as `LEX_API_KEY` is set, which is the Sync 1 switch.
 */
function useLexApi(env: Env): boolean {
  if (env.LAW_SEARCH_MODE === 'lex') return true;
  if (env.LAW_SEARCH_MODE === 'fake') return false;
  return Boolean(env.LEX_API_KEY);
}

@Global()
@Module({
  providers: [
    LexApiClient,
    FakeLawSearchService,
    FakeDocProcessingService,
    {
      provide: LAW_SEARCH,
      inject: [ENV, LexApiClient, FakeLawSearchService],
      useFactory: (env: Env, lex: LexApiClient, fake: FakeLawSearchService) =>
        useLexApi(env) ? lex : fake,
    },
    {
      provide: DOC_PROCESSING,
      inject: [ENV, LexApiClient, FakeDocProcessingService],
      useFactory: (
        env: Env,
        lex: LexApiClient,
        fake: FakeDocProcessingService,
      ) => (useLexApi(env) ? lex : fake),
    },
  ],
  exports: [LAW_SEARCH, DOC_PROCESSING],
})
export class LawSearchModule {}
