# Phase 01 — Contracts and mocks

**Goal:** one file with every signing shape, so backend and both frontends build against the same types,
and the frontends can start on mocks right away.

## Copy from tech award
- `TA/packages/contracts/src/index.ts`, lines ~465–811: `FieldTypeSchema`, `FIELD_VALUE_RULES`,
  `fieldValueProblem`, `sanitizeFieldInput`, `TemplateFieldSchema`, `PageSizeSchema`, `SignatureMethodSchema`.

## Steps
1. Create `packages/contracts/src/signing.ts`; add `export * from './signing.js';` to `src/index.ts`.
   Do **not** touch the old `createSignatureRequestBodySchema` in `ai.ts` (add-only rule); it just stops being used.
2. Port the field types as they are (`signature, initial, stamp, date, name, first_name, last_name, email,
   company, title, text, number, phone, address, checkbox, dropdown, radio, date_input`).
3. `fieldSchema` = tech award's `TemplateFieldSchema` **without `recipientKey`** (everyone fills every field).
   Keep: normalized `x, y, w, h` (0..1, top-left origin), `page` (1-based), `required`, `label`, `options`,
   both `refine`s.
4. `FIELD_VALUE_RULES`: tech award limits text to WinAnsi (no ş ğ ʼ). We embed a Unicode font (phase 04), so
   allow Latin, Uzbek Latin (ş ç ğ ö ʼ ‘ ’), Cyrillic, digits and punctuation. Keep the per-type rules
   (phone, number, email, date…).
5. New schemas (names are suggestions; keep them consistent):
   - `deliveryChannelSchema` = `email | telegram | sms | link`; `recipientSourceSchema` = `invite | open_link`.
   - `recipientInputSchema` = `{ name?, channel, contact? }` with a refine per channel:
     email → valid email; sms → `+998` + 9 digits; telegram → `@username` or phone; link → no contact needed.
   - `signatureRequestStatusSchema` = `draft | sent | cancelled`.
   - `createSigningDraftBodySchema` = `{ documentId }`.
   - `updateSigningDraftBodySchema` = `{ title?, message?, partyName?, fields?, recipients? (max 500) }`, at least one key.
   - `updateSigningAccessBodySchema` = `{ openLinkEnabled?, password?: string(4..64) | null }`.
   - `addRecipientsBodySchema` = `{ recipients: recipientInput[] (1..500) }`.
   - `signingRecipientWireSchema` = `{ id, name, channel, contact, source, status, viewedAt, signedAt,
     signUrl, ready, signerName, fieldValues }`.
   - `signingRequestWireSchema` = `{ id, title, documentId, documentName, status, message, partyName, fields,
     pageCount, pageSizes, openLinkEnabled, openLinkUrl, hasPassword, recipientCount, signedCount,
     createdAt, sentAt }` and `signingRequestDetailWireSchema` = that + `recipients[]`.
   - `signingRequestListSchema` = `{ requests: signingRequestWire (without fields/pageSizes)[] }`.
   - `sendSigningResponseSchema` = `{ id, recipients: { id, name, channel, contact, signUrl }[], openLinkUrl }`.
   - Public: `signerViewSchema` = `{ title, senderName, message, pageCount, pageSizes, fields, signed: boolean,
     cancelled: boolean, hasSummary: boolean }`; `lockedViewSchema` = `{ locked: true, title }`.
   - `unlockBodySchema` = `{ password }` → `{ ticket }`.
   - `openLinkInfoSchema` = `{ title, senderName, needsPassword }`;
     `openLinkStartBodySchema` = `{ name (1..200), phone?, password? }` → `{ token, ticket? }`.
   - `submitSigningBodySchema` = `{ signerName, signature: { method: typed | drawn | uploaded,
     image: data:image/png;base64,… (≤ 3 MB) }, fieldValues: record<string,string≤500>, agreed: literal(true) }`.
   - `signingStatusSchema` = `{ ready: boolean }`.
6. A `SIGNING_ROUTES` object next to the existing route list (paths from `docs/SIGNING-PLAN.md` §4).
7. Mocks in `packages/contracts/mocks/`: `signing-draft.json`, `signing-request-detail.json` (3 people:
   signed / viewed / pending, one from the open link), `signing-request-list.json`, `signing-send-response.json`,
   `signer-view.json`, `signer-view-locked.json`, `open-link-info.json`. Use Uzbek Latin text and real-looking
   field boxes on a 1-page A4 (`595 × 842`).

## Check
- `apps/api/test/contract-mocks.spec.ts` parses every mock against its schema — add the new mocks there and run
  just that spec.

## memory/
- CHANGELOG: new `@lex/contracts` signing shapes + mocks. STATE: frontends can build signing UI on mocks.
