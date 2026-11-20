import { Global, Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LawModule } from '../law/law.module.js';
import { DbLawSearchService } from './db-law-search.service.js';
import { FakeDocProcessingService } from './fake-doc-processing.service.js';
import { FakeLawSearchService } from './fake-law-search.service.js';
import { DOC_PROCESSING, LAW_SEARCH } from './law-search.types.js';

/**
 * Picks the real law search (LawModule, in-process) or the fixtures.
 * `LAW_SEARCH_MODE=auto` (the default) uses the db once `pnpm ingest:hf` has
 * loaded articles, and the fixtures on an empty law index.
 */
@Global()
@Module({
  imports: [LawModule],
  providers: [
    DbLawSearchService,
    FakeLawSearchService,
    FakeDocProcessingService,
    {
      provide: LAW_SEARCH,
      inject: [ENV, DbLawSearchService, FakeLawSearchService],
      useFactory: async (
        env: Env,
        db: DbLawSearchService,
        fake: FakeLawSearchService,
      ) => {
        if (env.LAW_SEARCH_MODE === 'db') return db;
        if (env.LAW_SEARCH_MODE === 'fake') return fake;
        const useDb = await db.hasData().catch(() => false);
        new Logger('LawSearchModule').log(
          `law search: ${useDb ? 'law tables' : 'fixtures (law index is empty)'}`,
        );
        return useDb ? db : fake;
      },
    },
    // Document extraction is not built yet (law plan): text and PDF only.
    { provide: DOC_PROCESSING, useExisting: FakeDocProcessingService },
  ],
  exports: [LAW_SEARCH, DOC_PROCESSING],
})
export class LawSearchModule {}
