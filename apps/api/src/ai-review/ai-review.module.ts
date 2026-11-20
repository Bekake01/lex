import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { AiUsageModule } from '../usage/ai-usage.module.js';
import { AiService } from './ai.service.js';
import { AiReviewController } from './ai-review.controller.js';
import { DocumentContentService } from './document-content.service.js';
import { EditsService } from './edits.service.js';
import { AnalyzeDocumentProcessor } from './jobs/analyze-document.processor.js';
import { ReviseDocumentProcessor } from './jobs/revise-document.processor.js';
import { SummarizeForRecipientsProcessor } from './jobs/summarize-for-recipients.processor.js';
import { ReviewService } from './review.service.js';

/**
 * The AI slice: the Claude calls, the three jobs, and the review API.
 *
 * The queues themselves come from the global `QueueModule`; `LawSearchModule`
 * and `StorageModule` are global too, so this module only wires its own
 * services and processors.
 */
@Module({
  imports: [DocumentsModule, AiUsageModule],
  controllers: [AiReviewController],
  providers: [
    AiService,
    DocumentContentService,
    ReviewService,
    EditsService,
    AnalyzeDocumentProcessor,
    ReviseDocumentProcessor,
    SummarizeForRecipientsProcessor,
  ],
  exports: [AiService, ReviewService, DocumentContentService],
})
export class AiReviewModule {}
