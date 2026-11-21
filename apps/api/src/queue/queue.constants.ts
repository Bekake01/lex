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
