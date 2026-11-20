import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { buildCertificatePdf, sha256, type SealService } from '@lex/crypto';
import type { Job, Queue } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Db } from '../../db/db.module.js';
import {
  documents,
  recipients,
  signatureRequests,
  users,
} from '../../db/schema/index.js';
import {
  jobIdForComplete,
  QUEUE,
  type CompleteSubmissionJob,
} from '../../queue/queue.constants.js';
import { StorageService } from '../../storage/storage.service.js';
import { SEAL } from '../seal.provider.js';
import { stampPdf } from '../stamp-pdf.js';

/** Retries for one completion: storage or the DB may hiccup. */
export const COMPLETE_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
} as const;

/**
 * One person's copy, off the request path: stamp their values and signature
 * into the original → SHA-256 → Ed25519 seal → certificate → store both →
 * record. IDEMPOTENT: a copy that already has both files is left alone, so a
 * retry or a duplicate never makes a second signed PDF (the seal binds one
 * hash to this copy). Errors throw, and BullMQ retries.
 */
@Processor(QUEUE.completeSubmission)
export class CompleteSubmissionProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(CompleteSubmissionProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    @Inject(SEAL) private readonly seal: SealService | null,
    @InjectQueue(QUEUE.completeSubmission) private readonly queue: Queue,
  ) {
    super();
  }

  /**
   * One sweep at start-up: signed copies with no sealed file (the enqueue
   * failed, or the API died mid-job) are queued again. No cron.
   */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.db
      .select({ id: recipients.id })
      .from(recipients)
      .where(
        and(eq(recipients.status, 'signed'), isNull(recipients.signedPdfKey)),
      );
    for (const { id } of stuck) {
      await this.queue.add(
        QUEUE.completeSubmission,
        { recipientId: id },
        {
          jobId: jobIdForComplete(id),
          ...COMPLETE_JOB_OPTIONS,
        },
      );
    }
    if (stuck.length > 0) {
      this.logger.warn(
        `re-queued ${stuck.length} signed copies with no sealed file`,
      );
    }
  }

  async process(job: Job<CompleteSubmissionJob>): Promise<void> {
    await this.complete(job.data.recipientId);
  }

  async complete(recipientId: string): Promise<void> {
    const [row] = await this.db
      .select({
        recipient: recipients,
        request: signatureRequests,
        document: documents,
        sender: { fullName: users.fullName, email: users.email },
      })
      .from(recipients)
      .innerJoin(
        signatureRequests,
        eq(signatureRequests.id, recipients.signatureRequestId),
      )
      .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
      .innerJoin(users, eq(users.id, signatureRequests.createdByUserId))
      .where(eq(recipients.id, recipientId))
      .limit(1);
    if (!row) return;
    const { recipient, request, document, sender } = row;
    if (recipient.status !== 'signed') return;
    if (recipient.signedPdfKey && recipient.certificateKey) return;

    if (!this.seal) {
      throw new Error(
        'SEAL_KEYS is not set: run `pnpm --filter api seal:keygen` and add it to apps/api/.env',
      );
    }
    if (!recipient.signatureImageKey || !recipient.signedAt) {
      throw new Error(`complete: recipient ${recipientId} has no signature`);
    }

    // The bytes must still be the ones that were sent.
    const original = await this.storage.get(document.storageKey);
    if (sha256(original) !== request.documentHash) {
      throw new Error(
        `complete: document of request ${request.id} changed since it was sent`,
      );
    }

    const signedPdf = await stampPdf({
      pdfBytes: original,
      fields: request.fields,
      fieldValues: recipient.fieldValues,
      signaturePng: await this.storage.get(recipient.signatureImageKey),
    });
    const signedHash = sha256(signedPdf);
    const { signature: sealSignature, kid: sealKid } = this.seal.seal({
      requestId: request.id,
      recipientId: recipient.id,
      signedAt: recipient.signedAt,
      signedHash,
      documentHash: request.documentHash,
      summaryHash: request.summaryHash,
    });

    const certificate = await buildCertificatePdf({
      requestId: request.id,
      recipientId: recipient.id,
      title: request.title,
      senderName: sender.fullName,
      senderEmail: sender.email,
      sentAt: request.sentAt,
      signer: {
        signerName: recipient.signerName ?? recipient.fullName ?? '—',
        channel: recipient.channel,
        contact: recipient.contact,
        source: recipient.source,
        method: recipient.signatureMethod ?? 'drawn',
        ip: recipient.signerIp,
        userAgent: recipient.signerUserAgent,
        viewedAt: recipient.viewedAt,
        consentAt: recipient.consentAt,
        signedAt: recipient.signedAt,
      },
      documentHash: request.documentHash,
      signedHash,
      summaryHash: request.summaryHash,
      sealSignature,
      sealKid,
    });

    // Files first, then one update: a crash in between leaves files nobody
    // points at (overwritten by the retry), never a row pointing at nothing.
    const signedPdfKey = `signed/${request.id}/${recipient.id}.pdf`;
    const certificateKey = `certificates/${request.id}/${recipient.id}.pdf`;
    await this.storage.put(signedPdfKey, signedPdf, 'application/pdf');
    await this.storage.put(certificateKey, certificate, 'application/pdf');

    await this.db
      .update(recipients)
      .set({ signedPdfKey, certificateKey, signedHash, sealSignature, sealKid })
      .where(
        and(eq(recipients.id, recipient.id), isNull(recipients.signedPdfKey)),
      );

    this.logger.log(
      `sealed copy ${recipient.id} of ${request.id}: ${signedHash.slice(0, 12)}…`,
    );
  }
}
