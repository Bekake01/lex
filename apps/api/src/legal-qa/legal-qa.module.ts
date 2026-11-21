import { Module } from '@nestjs/common';
import { AiReviewModule } from '../ai-review/ai-review.module.js';
import { AiUsageModule } from '../usage/ai-usage.module.js';
import { AnswerQuestionProcessor } from './answer-question.processor.js';
import { LegalQaController } from './legal-qa.controller.js';
import { LegalQaService } from './legal-qa.service.js';

/** General legal Q&A: the chat routes and the `answer-question` job. */
@Module({
  imports: [AiReviewModule, AiUsageModule],
  controllers: [LegalQaController],
  providers: [LegalQaService, AnswerQuestionProcessor],
})
export class LegalQaModule {}
