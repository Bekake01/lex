import type { ContractType } from '@lex/contracts';

/**
 * One anonymised contract with the issues a lawyer marked in it.
 *
 * Keep `text` free of real names, addresses, passport numbers and company
 * identifiers: the eval set is committed, and personal data is not.
 */
export interface EvalCase {
  id: string;
  /** Where the contract came from, and what was anonymised. */
  notes?: string;
  docType: ContractType;
  language: 'uz' | 'ru' | 'en';
  text: string;
  /** What a lawyer expects the review to find. */
  expectedIssues: ExpectedIssue[];
}

export interface ExpectedIssue {
  /** Clause the problem is in, as written in the document. */
  clauseRef: string;
  /** A reported issue counts as this one when it contains any of these. */
  anyOf: string[];
  severity?: 'low' | 'medium' | 'high';
  /** Optional: the act the finding should cite, e.g. "Mehnat kodeksi". */
  expectCitationFrom?: string;
}

export interface CaseResult {
  id: string;
  docType: ContractType;
  classifiedAs: ContractType;
  retrieved: number;
  reportedIssues: number;
  matchedExpected: number;
  expectedIssues: number;
  citationsClaimed: number;
  citationsKept: number;
  /** Dropped citations by reason, so retrieval gaps show up separately. */
  retrievalFailures: string[];
  modelFailures: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
}
