import {
  partyRoleSchema,
  type CitationWire,
  type ClauseWire,
  type DocumentTextWire,
  type DocumentVersionWire,
  type DocumentWire,
  type EditWire,
  type IssueWire,
  type PartyWire,
  type RecipientSummaryWire,
  type ReviewMessageWire,
  type ReviewWire,
} from '@lex/contracts';
import type {
  AiEdit,
  AiIssue,
  AiReview,
  AiReviewMessage,
  CitationSnapshot,
  Document,
  RecipientSummary,
  ReviewParty,
} from '../db/schema/index.js';

/**
 * The mapper is the filter: every wire object is built field by field here, so
 * a column we add later (a prompt, a raw model answer, a storage key) cannot
 * reach a client by accident.
 */

export function toCitationWire(
  snapshot: CitationSnapshot | null,
): CitationWire | null {
  if (!snapshot) return null;
  return {
    articleId: snapshot.articleId,
    actTitle: snapshot.actTitle,
    articleNumber: snapshot.articleNumber,
    sourceUrl: snapshot.sourceUrl,
    versionDate: snapshot.versionDate,
  };
}

export function toIssueWire(issue: AiIssue): IssueWire {
  return {
    id: issue.id,
    clauseRef: issue.clauseRef,
    quote: issue.quote,
    problem: issue.problem,
    severity: issue.severity,
    recommendation: issue.recommendation,
    citation: toCitationWire(issue.citation),
    ...(issue.clauseStart !== null && issue.clauseEnd !== null
      ? { clauseRange: { start: issue.clauseStart, end: issue.clauseEnd } }
      : {}),
  };
}

export function toReviewWire(review: AiReview, issues: AiIssue[]): ReviewWire {
  return {
    id: review.id,
    documentId: review.documentId,
    status: review.status,
    riskLevel: review.riskLevel ?? undefined,
    verdict: review.verdict ?? undefined,
    summary: review.summary ?? undefined,
    issues: issues.map(toIssueWire),
    lawVersionDate: review.lawVersionDate ?? undefined,
    language: review.language,
    createdAt: review.createdAt.toISOString(),
  };
}

export function toEditWire(edit: AiEdit): EditWire {
  return {
    id: edit.id,
    clauseRef: edit.clauseRef,
    original: edit.original,
    replacement: edit.replacement,
    reason: edit.reason,
    citation: toCitationWire(edit.citation),
    status: edit.status,
  };
}

export function toReviewMessageWire(
  message: AiReviewMessage,
  edits: AiEdit[],
): ReviewMessageWire {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    status: message.status,
    edits: edits.map(toEditWire),
    createdAt: message.createdAt.toISOString(),
  };
}

export function toPartyWire(party: ReviewParty): PartyWire {
  const role = partyRoleSchema.safeParse(party.role);
  return { name: party.name, role: role.success ? role.data : 'other' };
}

export function toDocumentVersionWire(doc: Document): DocumentVersionWire {
  return {
    documentId: doc.id,
    version: doc.version,
    parentDocumentId: doc.parentDocumentId,
    sha256: doc.sha256,
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Clause refs + offsets, without each clause's text (the text is one string). */
function toClauseWires(doc: Document): ClauseWire[] {
  return (doc.extractedClauses ?? []).map((c) => ({
    ref: c.ref,
    ...(c.heading ? { heading: c.heading } : {}),
    start: c.start,
    end: c.end,
  }));
}

/** Null until the document has been read (the first review reads it). */
export function toDocumentTextWire(doc: Document): DocumentTextWire | null {
  if (doc.extractedText === null && !doc.scanned) return null;
  return {
    documentId: doc.id,
    text: doc.scanned ? '' : (doc.extractedText ?? ''),
    clauses: doc.scanned ? [] : toClauseWires(doc),
    scanned: doc.scanned,
    language: doc.extractedLanguage,
  };
}

export function toDocumentWire(doc: Document, isLatest: boolean): DocumentWire {
  return {
    id: doc.id,
    name: doc.name,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    version: doc.version,
    parentDocumentId: doc.parentDocumentId,
    isLatest,
    // Present once the document has been read; the offsets index the same
    // extracted text the review quotes from.
    ...(doc.extractedClauses && doc.extractedClauses.length > 0
      ? { clauses: toClauseWires(doc) }
      : {}),
    ...(doc.scanned ? { scanned: true } : {}),
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toRecipientSummaryWire(
  summary: RecipientSummary,
  flaggedIssues?: IssueWire[],
): RecipientSummaryWire {
  return {
    language: summary.language,
    partyName: summary.partyName,
    overview: summary.body.overview,
    yourObligations: summary.body.yourObligations.map((o) => ({
      text: o.text,
      deadline: o.deadline,
      penalty: o.penalty,
      clauseRef: o.clauseRef,
    })),
    otherObligations: summary.body.otherObligations.map((o) => ({
      text: o.text,
      deadline: o.deadline,
      penalty: o.penalty,
      clauseRef: o.clauseRef,
    })),
    keyConditions: summary.body.keyConditions.map((c) => ({
      label: c.label,
      value: c.value,
    })),
    ...(flaggedIssues && flaggedIssues.length > 0 ? { flaggedIssues } : {}),
  };
}
