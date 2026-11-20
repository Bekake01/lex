import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import { recipients, signatureRequests } from '../../db/schema/index.js';
import {
  QUEUE,
  type SendSigningInviteJob,
} from '../../queue/queue.constants.js';
import { SignatureRequestsService } from '../signature-requests.service.js';

const RECHECK_MS = 3_000;

/**
 * Sends the signing invitations.
 *
 * It waits for `summarize-for-recipients` to finish so the first thing a
 * recipient sees is their summary — but only until `summaryDeadline`, after
 * which the invite goes out anyway. A missing summary must never stop a
 * contract from being signed.
 *
 * Delivery itself (Resend) belongs to the email track; this processor marks the
 * request sent and logs the links so the flow is complete end to end today.
 */
@Processor(QUEUE.sendSigningInvite)
export class SendSigningInviteProcessor extends WorkerHost {
  private readonly logger = new Logger(SendSigningInviteProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly signatureRequestsService: SignatureRequestsService,
  ) {
    super();
  }

  async process(job: Job<SendSigningInviteJob>, token?: string): Promise<void> {
    const { signatureRequestId, summaryDeadline } = job.data;

    const [request] = await this.db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, signatureRequestId))
      .limit(1);
    if (!request) return;
    if (request.sentAt) return;

    const summariesPending =
      request.summariesStatus === 'queued' ||
      request.summariesStatus === 'running';

    if (summariesPending && Date.now() < summaryDeadline) {
      // Put the job back with a short delay rather than burning an attempt.
      await job.moveToDelayed(Date.now() + RECHECK_MS, token);
      throw new DelayedError();
    }

    if (summariesPending) {
      this.logger.warn(
        `sending ${signatureRequestId} without summaries: they did not finish in time`,
      );
    }

    const people = await this.db
      .select({
        id: recipients.id,
        email: recipients.email,
        token: recipients.token,
      })
      .from(recipients)
      .where(eq(recipients.signatureRequestId, signatureRequestId));

    for (const person of people) {
      // The link carries the token, so it is logged at debug level only.
      this.logger.debug(
        `invite for recipient ${person.id}: ${this.signatureRequestsService.signUrl(person.token)}`,
      );
    }

    await this.db
      .update(signatureRequests)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(signatureRequests.id, signatureRequestId));

    this.logger.log(
      `signature request ${signatureRequestId} sent to ${people.length} recipients`,
    );
  }
}
