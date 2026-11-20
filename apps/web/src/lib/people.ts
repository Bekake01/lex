import { recipientInputSchema, type DeliveryChannel, type RecipientInput } from '@lex/contracts';

/** One editable person row (the draft's `recipients`, plus a client key). */
export interface PersonRow {
  key: string;
  name: string;
  channel: DeliveryChannel;
  contact: string;
}

export const CHANNELS: { id: DeliveryChannel; label: string; placeholder: string }[] = [
  { id: 'email', label: 'Email', placeholder: 'ism@pochta.uz' },
  { id: 'telegram', label: 'Telegram', placeholder: '@username' },
  { id: 'sms', label: 'SMS', placeholder: '+998 90 123 45 67' },
  { id: 'link', label: 'Faqat havola', placeholder: '' },
];

export const MAX_PEOPLE = 500;

export function blankRow(channel: DeliveryChannel = 'email'): PersonRow {
  return { key: crypto.randomUUID(), name: '', channel, contact: '' };
}

export function toInput(row: PersonRow): RecipientInput {
  return {
    ...(row.name.trim() ? { name: row.name.trim() } : {}),
    channel: row.channel,
    ...(row.channel !== 'link' && row.contact.trim() ? { contact: row.contact.trim() } : {}),
  };
}

/** The contract's own check for this row (the server runs the same one), or null. */
export function rowProblem(row: PersonRow): string | null {
  const parsed = recipientInputSchema.safeParse(toInput(row));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Notoğri');
}

/** A row with nothing typed yet: not saved, not an error. */
export function isEmptyRow(row: PersonRow): boolean {
  return !row.name.trim() && !row.contact.trim() && row.channel !== 'link';
}

/**
 * "Röyxatni qöyiş": one person per line, `Ism, kontakt` or just a contact.
 * The channel is guessed: an email address → Email, `@name` → Telegram,
 * digits → SMS, nothing → link only.
 */
export function parseList(text: string): PersonRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
      const last = parts.at(-1) ?? '';
      const contact = looksLikeContact(last) ? last : '';
      const name = (contact ? parts.slice(0, -1) : parts).join(' ');
      return { key: crypto.randomUUID(), name, channel: guessChannel(contact), contact };
    });
}

function looksLikeContact(value: string): boolean {
  return value.includes('@') || /^\+?[\d\s()-]{7,}$/.test(value);
}

export function guessChannel(contact: string): DeliveryChannel {
  if (!contact) return 'link';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'email';
  if (contact.startsWith('@')) return 'telegram';
  if (/\d/.test(contact)) return 'sms';
  return 'link';
}
