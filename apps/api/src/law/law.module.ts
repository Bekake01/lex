import { Module } from '@nestjs/common';
import { DocumentProcessingService } from './documents/document-processing.service.js';
import { EmbeddingService } from './embeddings/embedding.service.js';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';

/**
 * Uzbek law: hybrid search over law_acts / law_articles (keyword + Voyage
 * embeddings), and contract file reading (PDF/DOCX/text). The AI review uses
 * SearchService and DocumentProcessingService directly.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService, DocumentProcessingService, EmbeddingService],
  exports: [SearchService, DocumentProcessingService, EmbeddingService],
})
export class LawModule {}
