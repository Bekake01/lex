import type { AiLanguage } from '@lex/contracts';

/**
 * BullMQ queue names and payloads.
 *
 * Every job is idempotent: the payload carries only ids, the processor reads
 * the current row, and a re-delivered job finds the work already done and
 * returns. `jobIdFor*` builds the BullMQ job id that also makes *enqueueing*
 * idempotent — adding the same id twice is a no-op while the job exists.
 */
export const QUEUE = {
  analyzeDocument: 'analyze-document',
  reviseDocument: 'revise-document',
  summarizeForRecipients: 'summarize-for-recipients',
  sendSigningInvite: 'send-signing-invite',
  completeSubmission: 'complete-submission',
} as const;

/**
 * Reserved name for the law index sync. Phase 14 was built as a nightly
 * `@nestjs/schedule` cron instead (`src/law/sync/`, SYNC_ENABLED, advisory
 * lock), so no BullMQ queue uses this name.
 */
export const LAW_INDEX_SYNC_JOB = 'law-index-sync';

export interface AnalyzeDocumentJob {
  reviewId: string;
}

export interface ReviseDocumentJob {
  reviewId: string;
  /** The user message that asked for the change. */
  userMessageId: string;
  /** The assistant message row that will hold the proposed edits. */
  assistantMessageId: string;
}

export interface SummarizeForRecipientsJob {
  signatureRequestId: string;
  language: AiLanguage;
}

export interface SendSigningInviteJob {
  signatureRequestId: string;
  /** Epoch ms after which the invite is sent even without summaries. */
  summaryDeadline: number;
  /** Only these people (people added after the send); all when absent. */
  recipientIds?: string[];
}

/** Stamp → seal → certificate for one signed copy. */
export interface CompleteSubmissionJob {
  recipientId: string;
}

/**
 * BullMQ builds its Redis keys around `:`, so it rejects a custom job id that
 * contains one ("Custom Id cannot contain :"). Ids are joined with `.`; the
 * parts are uuids, which never contain either character.
 */
export const jobIdForAnalyze = (reviewId: string) => `analyze.${reviewId}`;
export const jobIdForRevise = (reviewId: string, userMessageId: string) =>
  `revise.${reviewId}.${userMessageId}`;
export const jobIdForSummarize = (signatureRequestId: string) =>
  `summarize.${signatureRequestId}`;
/** `invite.<requestId>` at send; `invite.<requestId>.<firstNewRecipientId>` per added batch. */
export const jobIdForInvite = (signatureRequestId: string, batchId?: string) =>
  batchId
    ? `invite.${signatureRequestId}.${batchId}`
    : `invite.${signatureRequestId}`;
export const jobIdForComplete = (recipientId: string) =>
  `complete.${recipientId}`;

/**
 * Worker options for every AI job, passed to `@Processor`.
 *
 * BullMQ renews a job's lock while it runs, so the default 30s is fine as long
 * as the renewal timer keeps firing. It does not when a dev laptop suspends
 * mid-job: that happened on the first real run and produced "could not renew
 * lock", after which the finished job could not be committed. A stalled job is
 * re-delivered, and here that means paying for the same model call twice.
 *
 * Two minutes is the compromise: long enough to survive a short stall, short
 * enough that a worker which really died gets its job retried quickly.
 */
export const AI_WORKER_OPTIONS = {
  lockDuration: 2 * 60 * 1000,
  stalledInterval: 30 * 1000,
  maxStalledCount: 2,
} as const;
