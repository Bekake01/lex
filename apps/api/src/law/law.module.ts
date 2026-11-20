import { Module } from '@nestjs/common';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';

/** Uzbek law: search over law_acts / law_articles. The AI review uses SearchService directly. */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class LawModule {}
