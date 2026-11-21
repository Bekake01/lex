import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DocumentProcessingService } from './documents/document-processing.service.js';
import { EmbeddingService } from './embeddings/embedding.service.js';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';
import { LexUzSyncScheduler } from './sync/sync.scheduler.js';

/**
 * Uzbek law: hybrid search over law_acts / law_articles (keyword + Voyage
 * embeddings), contract file reading (PDF/DOCX/text), and the nightly lex.uz
 * sync of the core acts (only when SYNC_ENABLED=true). The AI review uses
 * SearchService and DocumentProcessingService directly.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SearchController],
  providers: [SearchService, DocumentProcessingService, EmbeddingService, LexUzSyncScheduler],
  exports: [SearchService, DocumentProcessingService, EmbeddingService],
})
export class LawModule {}
