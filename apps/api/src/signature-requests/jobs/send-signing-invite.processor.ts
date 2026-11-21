import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import {
  recipients,
  signatureRequests,
  users,
} from '../../db/schema/index.js';
import { MailService } from '../../mail/mail.service.js';
import {
  AI_WORKER_OPTIONS,
  QUEUE,
  type SendSigningInviteJob,
} from '../../queue/queue.constants.js';
import { SignatureRequestsService } from '../signature-requests.service.js';
import { inviteEmail } from './invite-email.js';

const RECHECK_MS = 3_000;

/**
 * Sends the signing invitations.
 *
 * It waits for `summarize-for-recipients` to finish so the first thing a
 * recipient sees is their summary — but only until `summaryDeadline`, after
 * which the invite goes out anyway. A missing summary must never stop a
 * contract from being signed.
 *
 * `POST …/send` already marked the request sent. Email goes out through
 * Resend (`MailService`); Telegram / SMS are not delivered yet, so those
 * people only get a log line and the sender shares their links from the UI.
 * Each email carries an idempotency key, so a retried job never sends twice.
 */
@Processor(QUEUE.sendSigningInvite, AI_WORKER_OPTIONS)
export class SendSigningInviteProcessor extends WorkerHost {
  private readonly logger = new Logger(SendSigningInviteProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly signatureRequestsService: SignatureRequestsService,
    private readonly mail: MailService,
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
        fullName: recipients.fullName,
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

    const [sender] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, request.createdByUserId))
      .limit(1);
    const senderName = sender?.fullName ?? 'Cralex foydalanuvçisi';

    // Telegram / SMS are "Later": one log line per person, so the log shows
    // who is due. Email goes out now.
    const failed: string[] = [];
    for (const person of people) {
      this.logger.log(
        `invite ${signatureRequestId} → ${person.channel}${person.contact ? ` ${person.contact}` : ''} (recipient ${person.id})`,
      );
      const url = this.signatureRequestsService.signUrl(person.token);
      // The link carries the token, so it is logged at debug level only.
      this.logger.debug(`link for ${person.id}: ${url}`);

      if (person.channel !== 'email' || !person.contact) continue;
      try {
        await this.mail.send({
          to: person.contact,
          ...inviteEmail({
            senderName,
            recipientName: person.fullName,
            title: request.title,
            message: request.message,
            signUrl: url,
          }),
          idempotencyKey: `invite.${person.id}`,
        });
      } catch (err) {
        this.logger.error(
          `invite email for recipient ${person.id} failed: ${(err as Error).message}`,
        );
        failed.push(person.id);
      }
    }
    // Retry the job; people already emailed are skipped by Resend's idempotency key.
    if (failed.length > 0) {
      throw new Error(`invite email failed for ${failed.length} people`);
    }
  }
}
