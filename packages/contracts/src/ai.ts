/**
 * The AI boundary with the frontend team (`apps/web`, `apps/sign`).
 *
 * This file is the only thing the frontend builds against. Changes after it is
 * shared are **add-only**: new optional fields or new routes, never a rename or
 * a removal.
 *
 * Every schema here describes what crosses the wire. Server mappers build these
 * objects field by field, so raw prompts, raw model output and document text
 * never reach a client.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ enums -- */

export const contractTypeSchema = z.enum([
  'rental',
  'employment',
  'sale',
  'services',
  'nda',
  'other',
]);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const actTypeSchema = z.enum([
  'constitution',
  'code',
  'law',
  'decree',
  'resolution',
  'order',
  'other',
]);
export type ActType = z.infer<typeof actTypeSchema>;

/** Language of AI output. The law index itself is Uzbek Latin. */
export const aiLanguageSchema = z.enum(['uz', 'ru', 'en']);
export type AiLanguage = z.infer<typeof aiLanguageSchema>;

export const reviewStatusSchema = z.enum([
  'queued',
  'running',
  'done',
  'failed',
]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const verdictSchema = z.enum([
  'acceptable',
  'needs_changes',
  'not_acceptable',
]);
export type Verdict = z.infer<typeof verdictSchema>;

export const severitySchema = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof severitySchema>;

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageStatusSchema = z.enum(['pending', 'done', 'failed']);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const editStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);
export type EditStatus = z.infer<typeof editStatusSchema>;

export const partyRoleSchema = z.enum([
  'landlord',
  'tenant',
  'employer',
  'employee',
  'seller',
  'buyer',
  'provider',
  'client',
  'discloser',
  'recipient',
  'other',
]);
export type PartyRole = z.infer<typeof partyRoleSchema>;

/* ------------------------------------------------------------- wire types -- */

/** A law article the review is grounded in. Always from the retrieved set. */
export const citationWireSchema = z.object({
  articleId: z.string(),
  actTitle: z.string(),
  articleNumber: z.string().nullable(),
  sourceUrl: z.string(),
  versionDate: z.string(),
});
export type CitationWire = z.infer<typeof citationWireSchema>;

/**
 * One clause of a document, as the document numbers it, with the offsets it
 * occupies in the extracted text. Added after the first release: absent on a
 * document uploaded before extraction learned to find clauses.
 */
export const clauseWireSchema = z.object({
  /** The document's own ref: "4.2", "7-modda", "Статья 7", or "p3". */
  ref: z.string(),
  heading: z.string().optional(),
  start: z.number().int(),
  end: z.number().int(),
});
export type ClauseWire = z.infer<typeof clauseWireSchema>;

export const issueWireSchema = z.object({
  id: z.string(),
  clauseRef: z.string(),
  quote: z.string(),
  problem: z.string(),
  severity: severitySchema,
  recommendation: z.string(),
  /** null when no retrieved article supports the finding. */
  citation: citationWireSchema.nullable(),
  /**
   * Where `clauseRef` is in the document, when it matched a real clause.
   * Absent means the model named a clause the document does not have, so
   * `clauseRef` is its own wording: show it, but do not try to highlight it.
   */
  clauseRange: z
    .object({ start: z.number().int(), end: z.number().int() })
    .optional(),
});
export type IssueWire = z.infer<typeof issueWireSchema>;

export const reviewWireSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  status: reviewStatusSchema,
  riskLevel: riskLevelSchema.optional(),
  verdict: verdictSchema.optional(),
  summary: z.string().optional(),
  issues: z.array(issueWireSchema),
  /** "checked against legislation as of …" */
  lawVersionDate: z.string().optional(),
  language: aiLanguageSchema,
  createdAt: z.string(),
  /**
   * Only when `status` is `failed`: why, written for the user (unreadable
   * file, AI unavailable…). Never model output or contract text.
   */
  error: z.string().optional(),
});
export type ReviewWire = z.infer<typeof reviewWireSchema>;

export const editWireSchema = z.object({
  id: z.string(),
  clauseRef: z.string(),
  original: z.string(),
  replacement: z.string(),
  reason: z.string(),
  citation: citationWireSchema.nullable(),
  status: editStatusSchema,
});
export type EditWire = z.infer<typeof editWireSchema>;

export const reviewMessageWireSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  text: z.string(),
  status: messageStatusSchema,
  edits: z.array(editWireSchema),
  createdAt: z.string(),
});
export type ReviewMessageWire = z.infer<typeof reviewMessageWireSchema>;

export const documentVersionWireSchema = z.object({
  documentId: z.string(),
  version: z.number().int(),
  parentDocumentId: z.string().nullable(),
  sha256: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type DocumentVersionWire = z.infer<typeof documentVersionWireSchema>;

export const partyWireSchema = z.object({
  name: z.string(),
  role: partyRoleSchema,
});
export type PartyWire = z.infer<typeof partyWireSchema>;

export const obligationWireSchema = z.object({
  text: z.string(),
  deadline: z.string().optional(),
  penalty: z.string().optional(),
  clauseRef: z.string(),
});
export type ObligationWire = z.infer<typeof obligationWireSchema>;

export const keyConditionWireSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type KeyConditionWire = z.infer<typeof keyConditionWireSchema>;

/** One plain-language point of a summary, tied to the clause it comes from. */
export const summaryPointWireSchema = z.object({
  text: z.string(),
  /** The document's clause ref; empty when the point is about something the document leaves out. */
  clauseRef: z.string(),
});
export type SummaryPointWire = z.infer<typeof summaryPointWireSchema>;

/** Whose deadline it is, from the signer's side. */
export const summaryWhoSchema = z.enum(['you', 'other', 'both']);
export type SummaryWho = z.infer<typeof summaryWhoSchema>;

/** A date or time limit from the contract, for the signer's deadline list. */
export const summaryDeadlineWireSchema = z.object({
  /** e.g. "har oyning 5-sanasi", "1-fevral", "ketişdan 30 kun oldin". */
  when: z.string(),
  what: z.string(),
  who: summaryWhoSchema,
  clauseRef: z.string(),
});
export type SummaryDeadlineWire = z.infer<typeof summaryDeadlineWireSchema>;

/** A term that can hurt the signer, in plain words. */
export const summaryWarningWireSchema = z.object({
  text: z.string(),
  severity: severitySchema,
  clauseRef: z.string(),
});
export type SummaryWarningWire = z.infer<typeof summaryWarningWireSchema>;

/** What the signing app shows before consent. Precomputed at send time. */
export const recipientSummaryWireSchema = z.object({
  language: aiLanguageSchema,
  partyName: z.string(),
  overview: z.string(),
  yourObligations: z.array(obligationWireSchema),
  otherObligations: z.array(obligationWireSchema),
  keyConditions: z.array(keyConditionWireSchema),
  flaggedIssues: z.array(issueWireSchema).optional(),
  /*
   * Added 2026-11-21. Optional: summaries written before then don't have them.
   */
  /** What the signer receives: goods, money, a right, a service. */
  youGet: z.array(summaryPointWireSchema).optional(),
  /** What the signer pays or hands over, including rights they give up. */
  youGive: z.array(summaryPointWireSchema).optional(),
  /** Every date and time limit, in time order. */
  deadlines: z.array(summaryDeadlineWireSchema).optional(),
  /** Terms that can hurt the signer, most serious first. Empty = nothing stood out. */
  watchOut: z.array(summaryWarningWireSchema).optional(),
  /** How either side can end the contract early, the notice it needs and what it costs. */
  howToEnd: z.array(summaryPointWireSchema).optional(),
});
export type RecipientSummaryWire = z.infer<typeof recipientSummaryWireSchema>;

export const aiUsageWireSchema = z.object({
  /** Billing month, `YYYY-MM`. */
  period: z.string(),
  reviewsUsed: z.number().int(),
  /** null = unlimited. */
  reviewsLimit: z.number().int().nullable(),
  revisionsUsed: z.number().int(),
});
export type AiUsageWire = z.infer<typeof aiUsageWireSchema>;

export const documentWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  version: z.number().int(),
  parentDocumentId: z.string().nullable(),
  /** False once a newer version exists; only the latest version can be sent. */
  isLatest: z.boolean(),
  /**
   * The document's clauses, once it has been read (the first review reads it).
   * Offsets index the extracted text, which is the text the review quotes.
   */
  clauses: z.array(clauseWireSchema).optional(),
  /** True for a PDF with no text layer: a scan the model read as an image. */
  scanned: z.boolean().optional(),
  createdAt: z.string(),
});
export type DocumentWire = z.infer<typeof documentWireSchema>;

/**
 * `GET /documents/:id/text`: the extracted text the review quoted from, so a
 * screen can render the contract and highlight `issue.clauseRange` in it.
 * Offsets (`clauses`, `clauseRange`) are UTF-16 indexes into `text`, so
 * `text.slice(start, end)` works directly in JavaScript.
 */
export const documentTextWireSchema = z.object({
  documentId: z.string(),
  /** Empty for a scanned PDF: show the file instead (`GET /documents/:id/file`). */
  text: z.string(),
  clauses: z.array(clauseWireSchema),
  scanned: z.boolean(),
  /** Detected language of the text, e.g. `uz-latn`, `uz-cyrl`, `ru`. */
  language: z.string().nullable(),
});
export type DocumentTextWire = z.infer<typeof documentTextWireSchema>;

export const rejectEditsResponseSchema = z.object({ rejected: z.number().int() });
export type RejectEditsResponse = z.infer<typeof rejectEditsResponseSchema>;

/** `GET /documents`: the caller's documents, latest versions only, newest first. */
export const documentListSchema = z.object({
  documents: z.array(documentWireSchema),
});
export type DocumentList = z.infer<typeof documentListSchema>;

/* ---------------------------------------------------------- request bodies -- */

export const createReviewBodySchema = z.object({
  language: aiLanguageSchema.optional(),
});
export type CreateReviewBody = z.infer<typeof createReviewBodySchema>;

export const createReviewResponseSchema = z.object({ reviewId: z.string() });
export type CreateReviewResponse = z.infer<typeof createReviewResponseSchema>;

export const createMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
});
export type CreateMessageBody = z.infer<typeof createMessageBodySchema>;

export const createMessageResponseSchema = z.object({ messageId: z.string() });
export type CreateMessageResponse = z.infer<typeof createMessageResponseSchema>;

export const acceptEditsBodySchema = z.object({
  editIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AcceptEditsBody = z.infer<typeof acceptEditsBodySchema>;

export const acceptEditsResponseSchema = z.object({
  documentId: z.string(),
  version: z.number().int(),
});
export type AcceptEditsResponse = z.infer<typeof acceptEditsResponseSchema>;

/** `POST /signature-requests`: the AI-related fields this track added. */
export const signatureRequestRecipientSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).max(200),
  /** Which contract party this recipient is, from `GET /documents/:id/parties`. */
  partyName: z.string().trim().min(1).max(200).optional(),
});
export type SignatureRequestRecipient = z.infer<
  typeof signatureRequestRecipientSchema
>;

export const createSignatureRequestBodySchema = z.object({
  documentId: z.string().uuid(),
  recipients: z.array(signatureRequestRecipientSchema).min(1).max(20),
  summaryLanguage: aiLanguageSchema.optional(),
});
export type CreateSignatureRequestBody = z.infer<
  typeof createSignatureRequestBodySchema
>;

export const createSignatureRequestResponseSchema = z.object({
  signatureRequestId: z.string(),
  recipients: z.array(
    z.object({ id: z.string(), email: z.string(), signUrl: z.string() }),
  ),
});
export type CreateSignatureRequestResponse = z.infer<
  typeof createSignatureRequestResponseSchema
>;

/* ----------------------------------------------------------------- paths -- */

/** Single source of truth for the frontend's fetch calls. */
export const API_PATHS = {
  documents: '/documents',
  document: (id: string) => `/documents/${id}`,
  documentReviews: (id: string) => `/documents/${id}/reviews`,
  documentVersions: (id: string) => `/documents/${id}/versions`,
  /** `DocumentTextWire`: the text the review read, for showing + highlighting. */
  documentText: (id: string) => `/documents/${id}/text`,
  documentParties: (id: string) => `/documents/${id}/parties`,
  review: (id: string) => `/reviews/${id}`,
  reviewMessages: (id: string) => `/reviews/${id}/messages`,
  acceptEdits: (id: string) => `/reviews/${id}/edits/accept`,
  /** Same body as accept (`{ editIds }`); answers `RejectEditsResponse`. */
  rejectEdits: (id: string) => `/reviews/${id}/edits/reject`,
  signatureRequests: '/signature-requests',
  signSummary: (token: string) => `/sign/${token}/summary`,
  aiUsage: '/me/ai-usage',
} as const;

/** Error codes the frontend branches on. */
export const AI_ERROR_CODES = {
  /** Monthly review quota used up (402, same shape as TRIAL_ENDED). */
  reviewLimitReached: 'REVIEW_LIMIT_REACHED',
  /** Edits can only be applied to DOCX (422). */
  editsNeedDocx: 'EDITS_NEED_DOCX',
  /** The document changed, so `original` no longer matches exactly once (422). */
  editNotApplicable: 'EDIT_NOT_APPLICABLE',
  /** Only the latest version of a document can be sent (409). */
  notLatestVersion: 'NOT_LATEST_VERSION',
  /**
   * Applying edits to a DOCX is not available (501): only the fallback
   * processing service (`LAW_SEARCH_MODE=fake`) answers it.
   */
  editsNotAvailable: 'EDITS_NOT_AVAILABLE',
  /** `GET /documents/:id/text` before the first review read the file (409). */
  documentNotRead: 'DOCUMENT_NOT_READ',
} as const;
