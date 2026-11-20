import { randomBytes } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_ERROR_CODES,
  type CreateSignatureRequestBody,
  type CreateSignatureRequestResponse,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import type { CurrentUser } from '../common/current-user.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { recipients, signatureRequests } from '../db/schema/index.js';
import { DocumentsService } from '../documents/documents.service.js';
import {
  jobIdForInvite,
  jobIdForSummarize,
  QUEUE,
  type SendSigningInviteJob,
  type SummarizeForRecipientsJob,
} from '../queue/queue.constants.js';

@Injectable()
export class SignatureRequestsService {
  private readonly logger = new Logger(SignatureRequestsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly documents: DocumentsService,
    @InjectQueue(QUEUE.summarizeForRecipients)
    private readonly summarizeQueue: Queue,
    @InjectQueue(QUEUE.sendSigningInvite) private readonly inviteQueue: Queue,
  ) {}

  async create(
    user: CurrentUser,
    body: CreateSignatureRequestBody,
  ): Promise<CreateSignatureRequestResponse> {
    const document = await this.documents.forUser(user, body.documentId);

    // Only the latest version may be sent: an accepted AI edit creates a new
    // version, and sending the old one would send text nobody approved.
    if (!(await this.documents.isLatest(document))) {
      const latest = await this.documents.latestOf(document);
      throw new ConflictException({
        code: AI_ERROR_CODES.notLatestVersion,
        message: 'Only the latest version of a document can be sent',
        latestDocumentId: latest.id,
        latestVersion: latest.version,
      });
    }

    const language = body.summaryLanguage ?? 'uz';

    const created = await this.db.transaction(async (tx) => {
      const [request] = await tx
        .insert(signatureRequests)
        .values({
          documentId: document.id,
          createdByUserId: user.id,
          agencyId: user.agencyId,
          title: document.name,
          status: 'pending',
          documentHash: document.sha256,
          summaryLanguage: language,
          summariesStatus: 'queued',
        })
        .returning({ id: signatureRequests.id });

      const rows = await tx
        .insert(recipients)
        .values(
          body.recipients.map((recipient) => ({
            signatureRequestId: request.id,
            email: recipient.email.trim().toLowerCase(),
            fullName: recipient.fullName,
            partyName: recipient.partyName ?? null,
            token: newToken(),
          })),
        )
        .returning({
          id: recipients.id,
          email: recipients.email,
          token: recipients.token,
        });

      return { requestId: request.id, rows };
    });

    // Summaries are enqueued **before** the invite, and the invite waits for
    // them (up to SUMMARY_WAIT_MS) so a recipient never opens a link that has
    // no summary yet.
    const summarizePayload: SummarizeForRecipientsJob = {
      signatureRequestId: created.requestId,
      language,
    };
    await this.summarizeQueue.add(
      QUEUE.summarizeForRecipients,
      summarizePayload,
      {
        jobId: jobIdForSummarize(created.requestId),
      },
    );

    const invitePayload: SendSigningInviteJob = {
      signatureRequestId: created.requestId,
      summaryDeadline: Date.now() + this.env.SUMMARY_WAIT_MS,
    };
    await this.inviteQueue.add(QUEUE.sendSigningInvite, invitePayload, {
      jobId: jobIdForInvite(created.requestId),
    });

    this.logger.log(
      `signature request ${created.requestId}: ${created.rows.length} recipients, ` +
        `summaries in ${language}`,
    );

    return {
      signatureRequestId: created.requestId,
      recipients: created.rows.map((row) => ({
        id: row.id,
        email: row.email ?? '',
        signUrl: this.signUrl(row.token),
      })),
    };
  }

  signUrl(token: string): string {
    return `${this.env.SIGN_APP_URL.replace(/\/+$/, '')}/sign/${token}`;
  }
}

/** 32 random bytes: the only secret in a signing link. */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}
