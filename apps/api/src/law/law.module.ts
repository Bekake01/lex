import { Module } from '@nestjs/common';
import { DocumentProcessingService } from './documents/document-processing.service.js';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';

/**
 * Uzbek law: search over law_acts / law_articles, and contract file reading
 * (PDF/DOCX/text). The AI review uses SearchService and DocumentProcessingService directly.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService, DocumentProcessingService],
  exports: [SearchService, DocumentProcessingService],
})
export class LawModule {}
