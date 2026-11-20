import { Module } from '@nestjs/common';
import { CompleteSubmissionProcessor } from './jobs/complete-submission.processor.js';
import { sealProvider } from './seal.provider.js';
import { SigningController } from './signing.controller.js';
import { SigningService } from './signing.service.js';

/** The public signing link, plus the job that seals each signed copy. */
@Module({
  controllers: [SigningController],
  providers: [SigningService, CompleteSubmissionProcessor, sealProvider],
  exports: [SigningService],
})
export class SigningModule {}
