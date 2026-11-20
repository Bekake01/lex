import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { SendSigningInviteProcessor } from './jobs/send-signing-invite.processor.js';
import { SignatureRequestsController } from './signature-requests.controller.js';
import { SignatureRequestsService } from './signature-requests.service.js';

/** Sending for signature, plus the invite job that waits for the summaries. */
@Module({
  imports: [DocumentsModule],
  controllers: [SignatureRequestsController],
  providers: [SignatureRequestsService, SendSigningInviteProcessor],
})
export class SignatureRequestsModule {}
