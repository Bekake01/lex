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
} as const;

/**
 * The law index sync (`law-index-sync`) is owned by Developer A and runs inside
 * `apps/lex-api` (its own `SYNC_ENABLED`). `LAW_SYNC_ENABLED` here is the switch
 * for driving it from this side; nothing is registered until A asks for it, so
 * there is no queue standing empty.
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
}

export const jobIdForAnalyze = (reviewId: string) => `analyze:${reviewId}`;
export const jobIdForRevise = (reviewId: string, userMessageId: string) =>
  `revise:${reviewId}:${userMessageId}`;
export const jobIdForSummarize = (signatureRequestId: string) =>
  `summarize:${signatureRequestId}`;
export const jobIdForInvite = (signatureRequestId: string) =>
  `invite:${signatureRequestId}`;
