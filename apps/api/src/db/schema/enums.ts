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
/**
 * Signing uses `draft → sent → cancelled`. `pending` and `completed` are from
 * the old one-envelope model; Postgres can't drop enum values, so they stay
 * unused.
 */
export const signatureRequestStatus = pgEnum('signature_request_status', [
  'pending',
  'sent',
  'completed',
  'cancelled',
  'draft',
]);
export const deliveryChannel = pgEnum('delivery_channel', [
  'email',
  'telegram',
  'sms',
  'link',
]);
export const recipientSource = pgEnum('recipient_source', [
  'invite',
  'open_link',
]);
export const signatureMethod = pgEnum('signature_method', [
  'typed',
  'drawn',
  'uploaded',
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
