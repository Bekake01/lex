import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import { recipients, signatureRequests } from '../../db/schema/index.js';
import {
  AI_WORKER_OPTIONS,
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
 * `POST …/send` already marked the request sent. Delivery itself is not built
 * (channels are shown, not delivered): this processor logs the links. Phase 07
 * reworks it per channel.
 */
@Processor(QUEUE.sendSigningInvite, AI_WORKER_OPTIONS)
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
    // Cancelled since (or never sent): nothing to deliver.
    if (!request || request.status !== 'sent') return;

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
        channel: recipients.channel,
        contact: recipients.contact,
        token: recipients.token,
      })
      .from(recipients)
      .where(
        and(
          eq(recipients.signatureRequestId, signatureRequestId),
          // Open-link copies were started by the person themselves.
          eq(recipients.source, 'invite'),
          job.data.recipientIds
            ? inArray(recipients.id, job.data.recipientIds)
            : undefined,
        ),
      );

    // Real delivery (Telegram bot, SMS, Resend) is "Later": the sender shares
    // the links from the UI. One line per person, so the log shows who is due.
    for (const person of people) {
      this.logger.log(
        `invite ${signatureRequestId} → ${person.channel}${person.contact ? ` ${person.contact}` : ''} (recipient ${person.id})`,
      );
      // The link carries the token, so it is logged at debug level only.
      this.logger.debug(
        `link for ${person.id}: ${this.signatureRequestsService.signUrl(person.token)}`,
      );
    }
  }
}
