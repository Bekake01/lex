import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums shared by the AI and signing tables. The values are exactly the ones
 * in `@lex/contracts` (`packages/contracts/src/ai.ts`), so a column value can
 * go to the wire unchanged.
 */
export const aiLanguage = pgEnum('ai_language', ['uz', 'ru', 'en']);
export const contractType = pgEnum('contract_type', [
  'rental',
  'employment',
  'sale',
  'services',
  'nda',
  'other',
]);
export const reviewStatus = pgEnum('review_status', [
  'queued',
  'running',
  'done',
  'failed',
]);
export const riskLevel = pgEnum('risk_level', ['low', 'medium', 'high']);
export const verdict = pgEnum('verdict', [
  'acceptable',
  'needs_changes',
  'not_acceptable',
]);
export const severity = pgEnum('severity', ['low', 'medium', 'high']);
export const messageRole = pgEnum('message_role', ['user', 'assistant']);
export const messageStatus = pgEnum('message_status', [
  'pending',
  'done',
  'failed',
]);
export const editStatus = pgEnum('edit_status', [
  'proposed',
  'accepted',
  'rejected',
]);
export const partyRole = pgEnum('party_role', [
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
export const signatureRequestStatus = pgEnum('signature_request_status', [
  'pending',
  'sent',
  'completed',
  'cancelled',
]);
export const recipientStatus = pgEnum('recipient_status', [
  'pending',
  'viewed',
  'signed',
]);
export const summariesStatus = pgEnum('summaries_status', [
  'queued',
  'running',
  'done',
  'failed',
]);
