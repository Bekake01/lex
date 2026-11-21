/**
 * The signing boundary: sender dashboard (`apps/web`), signing app
 * (`apps/sign`) and the API all build against this file.
 *
 * Model (docs/SIGNING-PLAN.md): a send = one PDF + one field layout to many
 * people. Every person fills every field on **their own copy**, which is sealed
 * on its own. Same rule as `ai.ts`: once shared, changes are **add-only**.
 *
 * Field types, value rules and the field shape are ported from tech award's
 * contracts, minus `recipientKey` (everyone fills every field) and with the
 * WinAnsi limit lifted (stamping embeds a Unicode font, phase 04).
 */
import { z } from 'zod';

/* ----------------------------------------------------------------- fields -- */

/**
 * The field types a sender can place. Three families, and the distinction is
 * a security boundary, not a UI one:
 *   - marks   (signature/initial/stamp) take the adopted signature image;
 *   - auto    (date, shown as "Imzolangan sana") is set by the SERVER from the
 *             signing moment and never accepted from the client;
 *   - inputs  (every other type) are typed by the signer, and each must pass
 *             its FIELD_VALUE_RULES entry below.
 */
export const fieldTypeSchema = z.enum([
  'signature',
  'initial',
  'stamp',
  'date',
  'name',
  'first_name',
  'last_name',
  'email',
  'company',
  'title',
  'text',
  'number',
  'phone',
  'address',
  'checkbox',
  'dropdown',
  'radio',
  // A date the signer picks (a start date, a birth date). Not the signing
  // date — that is `date`, and it stays server truth.
  'date_input',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** Field types that take the adopted signature image, not typed text. */
export const MARK_FIELD_TYPES = ['signature', 'initial', 'stamp'] as const;

/**
 * Characters the sealed PDF can print with the embedded Noto Sans: ASCII,
 * Latin-1, Latin Extended-A/B (ş ç ğ ö …), Cyrillic (incl. Uzbek ў қ ғ ҳ),
 * the Uzbek apostrophes ʻ ʼ ‘ ’ and common typographic punctuation.
 */
const PRINTABLE =
  /^[\x20-\x7E\xA0-\u024F\u0400-\u04FF‘’“”«»–—…•ʻʼ№]*$/u;

/**
 * Letters a name may use, all present in Noto Sans: Latin (incl. Latin-1,
 * Extended-A/B, Extended Additional) and Cyrillic (incl. Supplement). Explicit
 * ranges, not `\p{Script=…}`, which also takes Roman numerals and new letters
 * the font has no glyph for.
 */
const NAME_LETTERS =
  'A-Za-z\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\u024F\\u1E00-\\u1EFF\\u0400-\\u0481\\u048A-\\u052F';
/** The joins names really use, plus combining accents. */
const NAME_JOINS = " '`‘’ʻʼ.\\u0300-\\u036F-";

/**
 * A person's name: Latin or Cyrillic letters and the joins names really use —
 * space, hyphen, full stop and every apostrophe Uzbek is typed with
 * (' ` ‘ ’ ʻ ʼ). At least one letter, so a box of punctuation is not a name.
 */
const PERSON_NAME = new RegExp(
  `^(?=.*[${NAME_LETTERS}])[${NAME_LETTERS}${NAME_JOINS}]+$`,
  'u',
);

/** What may be TYPED into a name box; digits and symbols are dropped. */
const NAME_CHAR = new RegExp(`[${NAME_LETTERS}${NAME_JOINS}]`, 'u');

/** The range a date box accepts — also the calendar picker's min and max. */
export const DATE_INPUT_MIN = '1900-01-01';
export const DATE_INPUT_MAX = '2200-12-31';

/** YYYY-MM-DD naming a day that exists (no 30 February), inside the range above. */
function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m || value < DATE_INPUT_MIN || value > DATE_INPUT_MAX) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return (
    day.getUTCFullYear() === y &&
    day.getUTCMonth() === mo - 1 &&
    day.getUTCDate() === d
  );
}

export interface FieldValueRule {
  /** Longest accepted value, in characters, after trimming. */
  max: number;
  /** The whole value — trimmed, and never empty (empty is "not filled"). */
  valid: z.ZodType<string>;
  /** Characters kept as they are typed; anything else is dropped. */
  chars?: RegExp;
  /** What the box accepts, in words: the signer's error, the sender's description. */
  hint: string;
}

const printable = (max: number): FieldValueRule => ({
  max,
  valid: z.string().regex(PRINTABLE),
  hint: 'Harflar, raqamlar va tiniş belgilari',
});

const personName = (max: number): FieldValueRule => ({
  max,
  valid: z.string().regex(PERSON_NAME),
  chars: NAME_CHAR,
  hint: 'Faqat harflar — böşliq, defis va apostrof bölişi mumkin',
});

const choice: FieldValueRule = {
  // Membership in the sender's options needs the field itself, so the API
  // checks that at submit. Here: only the length the editor allows.
  max: 120,
  valid: z.string(),
  hint: 'Taklif qilingan variantlardan birini tanlang',
};

/**
 * What a signer may enter into each box — ONE definition for both sides: the
 * signing app drops impossible characters as they are typed and explains a
 * bad value on the spot; the API refuses the same value when the browser was
 * bypassed. Marks and the signing date are null — nothing typed reaches them.
 */
export const FIELD_VALUE_RULES: Record<FieldType, FieldValueRule | null> = {
  signature: null,
  initial: null,
  stamp: null,
  date: null,
  name: personName(100),
  first_name: personName(60),
  last_name: personName(60),
  email: {
    max: 254,
    valid: z.string().email(),
    chars: /\S/,
    hint: 'Elektron poçta manzili, masalan ism@example.com',
  },
  company: printable(200),
  title: printable(120),
  text: printable(500),
  number: {
    max: 30,
    // An optional minus, digits, and at most one decimal mark (. or ,).
    valid: z.string().regex(/^-?\d+(?:[.,]\d+)?$/),
    chars: /[\d.,-]/,
    hint: 'Faqat raqamlar, masalan 42 yoki 3,5',
  },
  phone: {
    max: 30,
    // E.164 caps a number at 15 digits; under 7 reaches no one anywhere.
    valid: z
      .string()
      .regex(/^\+?[\d ()-]+$/)
      .refine((v) => {
        const digits = v.replace(/\D/g, '').length;
        return digits >= 7 && digits <= 15;
      }),
    chars: /[\d+() -]/,
    hint: 'Telefon raqami, masalan +998 90 123 45 67',
  },
  address: printable(300),
  checkbox: {
    max: 4,
    valid: z.string().refine((v) => v === 'true'),
    hint: 'Belgini qöying',
  },
  dropdown: choice,
  radio: choice,
  date_input: {
    max: 10,
    valid: z.string().refine(isCalendarDate),
    hint: 'Kalendardan sanani tanlang',
  },
};

/**
 * Why `value` cannot go into a box of `type`, in words the signer can act on —
 * or null when it can. Checks the TRIMMED value. Empty passes: "not filled" is
 * the required check's business. Types with no rule answer null.
 */
export function fieldValueProblem(type: FieldType, value: string): string | null {
  const rule = FIELD_VALUE_RULES[type];
  const v = value.trim();
  if (!rule || v === '') return null;
  if (v.length > rule.max || !rule.valid.safeParse(v).success) return rule.hint;
  return null;
}

/**
 * `raw` as the box should hold it while the signer types: characters no valid
 * value can contain are dropped, and it is capped at the box's length.
 */
export function sanitizeFieldInput(type: FieldType, raw: string): string {
  const rule = FIELD_VALUE_RULES[type];
  if (!rule) return raw;
  const chars = rule.chars;
  const kept = chars
    ? Array.from(raw)
        .filter((ch) => chars.test(ch))
        .join('')
    : raw;
  return kept.slice(0, rule.max);
}

const fraction = z.number().min(0).max(1);

/**
 * One placed field. Coordinates are NORMALIZED fractions of the page, TOP-LEFT
 * origin (x,y = the field's top-left corner; w,h = size). The stamper converts
 * to PDF's bottom-left origin. `page` is 1-based.
 */
export const fieldSchema = z
  .object({
    id: z.string().uuid(),
    type: fieldTypeSchema,
    page: z.number().int().min(1),
    x: fraction,
    y: fraction,
    w: fraction.min(0.005),
    h: fraction.min(0.005),
    required: z.boolean().default(true),
    label: z.string().max(200).optional(),
    /** Allowed values for dropdown / radio; the server rejects anything else. */
    options: z.array(z.string().min(1).max(120)).max(30).optional(),
  })
  .refine((f) => f.x + f.w <= 1.0001 && f.y + f.h <= 1.0001, {
    message: 'field extends past the page bounds',
  })
  .refine(
    (f) => !['dropdown', 'radio'].includes(f.type) || (f.options?.length ?? 0) >= 1,
    { message: 'a dropdown or radio field needs at least one option' },
  );
export type Field = z.infer<typeof fieldSchema>;

export const fieldsSchema = z.array(fieldSchema).max(500);

/** A PDF page size in points (A4 = 595 × 842). */
export const pageSizeSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});
export type PageSize = z.infer<typeof pageSizeSchema>;

export const signatureMethodSchema = z.enum(['typed', 'drawn', 'uploaded']);
export type SignatureMethod = z.infer<typeof signatureMethodSchema>;

/* ----------------------------------------------------------------- people -- */

export const deliveryChannelSchema = z.enum(['email', 'telegram', 'sms', 'link']);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

/** `invite` = added by the sender; `open_link` = started from the public link. */
export const recipientSourceSchema = z.enum(['invite', 'open_link']);
export type RecipientSource = z.infer<typeof recipientSourceSchema>;

export const signingRecipientStatusSchema = z.enum(['pending', 'viewed', 'signed']);
export type SigningRecipientStatus = z.infer<typeof signingRecipientStatusSchema>;

export const signatureRequestStatusSchema = z.enum(['draft', 'sent', 'cancelled']);
export type SignatureRequestStatus = z.infer<typeof signatureRequestStatusSchema>;

/** Uzbek mobile number: +998 and 9 digits. */
export const UZ_PHONE = /^\+998\d{9}$/;
/** Telegram username: @, a letter, then 4–31 letters, digits or underscores. */
export const TELEGRAM_USERNAME = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

/** Strip spaces, dashes and brackets a person types into a phone number. */
export const compactPhone = (v: string) => v.replace(/[\s()-]/g, '');

/**
 * One person to send to. The contact is checked per channel; `link` needs
 * none (the sender copies the link themselves). The server stores the contact
 * normalized (compact phone, lower-case email).
 */
export const recipientInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    channel: deliveryChannelSchema,
    contact: z.string().trim().max(254).optional(),
  })
  .superRefine((r, ctx) => {
    const c = r.contact ?? '';
    const bad = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['contact'], message });
    switch (r.channel) {
      case 'email':
        if (!z.string().email().safeParse(c).success)
          bad('Elektron poçta manzili notoğri');
        break;
      case 'sms':
        if (!UZ_PHONE.test(compactPhone(c)))
          bad('Telefon raqami +998 va 9 ta raqam bölişi kerak');
        break;
      case 'telegram':
        if (!TELEGRAM_USERNAME.test(c) && !/^\+\d{7,15}$/.test(compactPhone(c)))
          bad('Telegram: @username yoki telefon raqami');
        break;
      case 'link':
        break;
    }
  });
export type RecipientInput = z.infer<typeof recipientInputSchema>;

/* ------------------------------------------------------ sender: requests -- */

/** `POST /signature-requests` — a draft from an uploaded PDF. */
export const createSigningDraftBodySchema = z.object({
  documentId: z.string().uuid(),
});
export type CreateSigningDraftBody = z.infer<typeof createSigningDraftBodySchema>;

/** `PATCH /signature-requests/:id` (draft only). `fields` / `recipients` replace the whole list. */
export const updateSigningDraftBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().max(2000).nullable().optional(),
    partyName: z.string().trim().min(1).max(200).nullable().optional(),
    fields: fieldsSchema.optional(),
    recipients: z.array(recipientInputSchema).max(500).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'nothing to update',
  });
export type UpdateSigningDraftBody = z.infer<typeof updateSigningDraftBodySchema>;

/** `PATCH /signature-requests/:id/access` (draft or sent). `password: null` removes it. */
export const updateSigningAccessBodySchema = z
  .object({
    openLinkEnabled: z.boolean().optional(),
    password: z.string().min(4).max(64).nullable().optional(),
  })
  .refine((b) => b.openLinkEnabled !== undefined || b.password !== undefined, {
    message: 'nothing to update',
  });
export type UpdateSigningAccessBody = z.infer<typeof updateSigningAccessBodySchema>;

/** `POST /signature-requests/:id/recipients` — add people to a sent send. */
export const addRecipientsBodySchema = z.object({
  recipients: z.array(recipientInputSchema).min(1).max(500),
});
export type AddRecipientsBody = z.infer<typeof addRecipientsBodySchema>;

/** One person's copy, as the sender sees it. */
export const signingRecipientWireSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  channel: deliveryChannelSchema,
  contact: z.string().nullable(),
  source: recipientSourceSchema,
  status: signingRecipientStatusSchema,
  viewedAt: z.string().datetime().nullable(),
  signedAt: z.string().datetime().nullable(),
  signUrl: z.string(),
  /** The sealed copy and certificate can be downloaded. */
  ready: z.boolean(),
  /** The name the person typed when signing. */
  signerName: z.string().nullable(),
  /** What they entered, by field id; empty until signed. */
  fieldValues: z.record(z.string(), z.string()),
});
export type SigningRecipientWire = z.infer<typeof signingRecipientWireSchema>;

export const signingRequestWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string(),
  documentName: z.string(),
  status: signatureRequestStatusSchema,
  message: z.string().nullable(),
  /** Which contract party the people are (for the AI summary). */
  partyName: z.string().nullable(),
  fields: fieldsSchema,
  pageCount: z.number().int().positive(),
  pageSizes: z.array(pageSizeSchema),
  openLinkEnabled: z.boolean(),
  openLinkUrl: z.string().nullable(),
  hasPassword: z.boolean(),
  recipientCount: z.number().int().nonnegative(),
  signedCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
});
export type SigningRequestWire = z.infer<typeof signingRequestWireSchema>;

/** `GET /signature-requests/:id` (also what create / patch return). */
export const signingRequestDetailWireSchema = signingRequestWireSchema.extend({
  recipients: z.array(signingRecipientWireSchema),
});
export type SigningRequestDetailWire = z.infer<typeof signingRequestDetailWireSchema>;

/** One list row: a send without its field layout. */
export const signingRequestRowSchema = signingRequestWireSchema
  .omit({ fields: true, pageSizes: true })
  .extend({
    /** `box=inbox`: who sent it. */
    senderName: z.string().optional(),
    /** `box=inbox`: the caller's own copy in this send (their email is a recipient). */
    mine: z
      .object({
        recipientId: z.string(),
        status: signingRecipientStatusSchema,
        signedAt: z.string().datetime().nullable(),
        signUrl: z.string(),
      })
      .optional(),
  });
export type SigningRequestRow = z.infer<typeof signingRequestRowSchema>;

/** `GET /signature-requests?box=sent|inbox` — rows without the field layout. */
export const signingRequestListSchema = z.object({
  requests: z.array(signingRequestRowSchema),
});
export type SigningRequestList = z.infer<typeof signingRequestListSchema>;

export const signingBoxSchema = z.enum(['sent', 'inbox']);
export type SigningBox = z.infer<typeof signingBoxSchema>;

/** `POST /signature-requests/:id/send` (and `…/recipients`): every link to share. */
export const sendSigningResponseSchema = z.object({
  id: z.string(),
  recipients: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      channel: deliveryChannelSchema,
      contact: z.string().nullable(),
      signUrl: z.string(),
    }),
  ),
  openLinkUrl: z.string().nullable(),
});
export type SendSigningResponse = z.infer<typeof sendSigningResponseSchema>;

/* ------------------------------------------------- public: signing app -- */

/** `GET /sign/:token` — what the signer's browser needs (no secrets). */
export const signerViewSchema = z.object({
  title: z.string(),
  senderName: z.string(),
  message: z.string().nullable(),
  /** The name the sender typed for this person, to prefill `signerName`. */
  recipientName: z.string().nullable(),
  pageCount: z.number().int().positive(),
  pageSizes: z.array(pageSizeSchema),
  fields: fieldsSchema,
  /** Already signed: show the done screen, not the form. */
  signed: z.boolean(),
  cancelled: z.boolean(),
  /** `GET /sign/:token/summary` has a summary to show. */
  hasSummary: z.boolean(),
});
export type SignerView = z.infer<typeof signerViewSchema>;

/** `GET /sign/:token` when the send has a password and no valid ticket was sent. */
export const lockedViewSchema = z.object({
  locked: z.literal(true),
  title: z.string(),
});
export type LockedView = z.infer<typeof lockedViewSchema>;

export const signerViewResponseSchema = z.union([lockedViewSchema, signerViewSchema]);
export type SignerViewResponse = z.infer<typeof signerViewResponseSchema>;

/** `POST /sign/:token/unlock`. Wrong password → 401; too many tries → 423. */
export const unlockBodySchema = z.object({ password: z.string().min(1).max(64) });
export type UnlockBody = z.infer<typeof unlockBodySchema>;

/** The ticket goes back on every later call as the `x-sign-ticket` header. */
export const unlockResponseSchema = z.object({ ticket: z.string() });
export type UnlockResponse = z.infer<typeof unlockResponseSchema>;

export const SIGN_TICKET_HEADER = 'x-sign-ticket';

/** `GET /sign/open/:publicToken`. */
export const openLinkInfoSchema = z.object({
  title: z.string(),
  senderName: z.string(),
  needsPassword: z.boolean(),
});
export type OpenLinkInfo = z.infer<typeof openLinkInfoSchema>;

/** `POST /sign/open/:publicToken/start` — makes this person's own copy. */
export const openLinkStartBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => /^\+?\d{7,15}$/.test(compactPhone(v)), {
      message: 'Telefon raqami notoğri',
    })
    .optional(),
  password: z.string().min(1).max(64).optional(),
});
export type OpenLinkStartBody = z.infer<typeof openLinkStartBodySchema>;

export const openLinkStartResponseSchema = z.object({
  token: z.string(),
  ticket: z.string().optional(),
});
export type OpenLinkStartResponse = z.infer<typeof openLinkStartResponseSchema>;

/** `POST /sign/:token/submit`. Field values are checked against FIELD_VALUE_RULES. */
export const submitSigningBodySchema = z.object({
  signerName: z.string().trim().min(1).max(200),
  signature: z.object({
    method: signatureMethodSchema,
    image: z.string().startsWith('data:image/png;base64,').max(3_000_000),
  }),
  fieldValues: z.record(z.string(), z.string().max(500)),
  agreed: z.literal(true),
});
export type SubmitSigningBody = z.infer<typeof submitSigningBodySchema>;

export const submitSigningResponseSchema = z.object({ ok: z.literal(true) });
export type SubmitSigningResponse = z.infer<typeof submitSigningResponseSchema>;

/** `GET /sign/:token/status` — the sealed copy is ready to download. */
export const signingStatusSchema = z.object({ ready: z.boolean() });
export type SigningStatus = z.infer<typeof signingStatusSchema>;

/* ------------------------------------------------------------ errors -- */

/** `code` values on signing error responses the frontend branches on. */
export const SIGNING_ERROR_CODES = {
  /** Only a PDF can be sent for signing (415). */
  pdfOnly: 'PDF_ONLY',
  /** The PDF could not be read, or has rotated pages (400). */
  pdfUnreadable: 'PDF_UNREADABLE',
  /** The change needs a draft; this send is already sent or cancelled (409). */
  notDraft: 'NOT_DRAFT',
  /** The change needs a sent send (409). */
  notSent: 'NOT_SENT',
  /** The send was cancelled (409). */
  cancelled: 'REQUEST_CANCELLED',
  /** Send needs at least one signature field (422). */
  needsSignatureField: 'NEEDS_SIGNATURE_FIELD',
  /** Send needs at least one person, or the open link on (422). */
  needsRecipients: 'NEEDS_RECIPIENTS',
  /** A field points past the last page, or two fields share an id (400). */
  badFields: 'BAD_FIELDS',
  /** `POST /sign/:token/unlock` or open-link start: wrong password (401). */
  wrongPassword: 'WRONG_PASSWORD',
  /** Too many wrong passwords on this link; the sender must reset it (423). */
  locked: 'LINK_LOCKED',
} as const;

/* ----------------------------------------------------------------- paths -- */

/** Signing routes (docs/SIGNING-PLAN.md §4), next to `API_PATHS` in `ai.ts`. */
export const SIGNING_ROUTES = {
  // sender (logged in)
  requests: '/signature-requests',
  requestList: (box: SigningBox) => `/signature-requests?box=${box}`,
  request: (id: string) => `/signature-requests/${id}`,
  requestAccess: (id: string) => `/signature-requests/${id}/access`,
  requestSend: (id: string) => `/signature-requests/${id}/send`,
  requestRecipients: (id: string) => `/signature-requests/${id}/recipients`,
  requestCancel: (id: string) => `/signature-requests/${id}/cancel`,
  recipientSigned: (id: string, rid: string) =>
    `/signature-requests/${id}/recipients/${rid}/signed`,
  recipientCertificate: (id: string, rid: string) =>
    `/signature-requests/${id}/recipients/${rid}/certificate`,
  documentFile: (documentId: string) => `/documents/${documentId}/file`,
  // public (token only)
  sign: (token: string) => `/sign/${token}`,
  signUnlock: (token: string) => `/sign/${token}/unlock`,
  signSummary: (token: string) => `/sign/${token}/summary`,
  signDocument: (token: string) => `/sign/${token}/document`,
  signSubmit: (token: string) => `/sign/${token}/submit`,
  signStatus: (token: string) => `/sign/${token}/status`,
  signSigned: (token: string) => `/sign/${token}/signed`,
  signCertificate: (token: string) => `/sign/${token}/certificate`,
  openLink: (publicToken: string) => `/sign/open/${publicToken}`,
  openLinkStart: (publicToken: string) => `/sign/open/${publicToken}/start`,
} as const;
