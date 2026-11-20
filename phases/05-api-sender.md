# Phase 05 — Sender API

**Goal:** a logged-in user can create a draft from a PDF, save fields and people, set open link / password,
send, add more people, list sends, see one send in detail, download copies, and cancel.

All routes: `@UseGuards(CurrentUserGuard)`, bodies via `@ZodBody(...)` with the phase 01 schemas, owner check =
`createdByUserId === user.id` (no tenant layer). Wire shapes come from `@lex/contracts`.

## Copy from tech award (as reference, not 1:1)
- `TA/apps/api/src/modules/signature-requests/signature-requests.service.ts` — mappers, list counts,
  "waiting on" logic. Strip routing, folders, tenant, emails.

## Steps
1. **`POST /signature-requests` `{documentId}`** — `documents.forUser`; must be the latest version
   (existing `notLatestVersion` 409) and `contentType === 'application/pdf'` → otherwise **415** with
   `code: 'PDF_ONLY'` and message "Faqat PDF yuboriş mumkin". Read page count + sizes (`pdf-geometry.ts`).
   Insert `status: 'draft'`, `title` = document name without extension, `documentHash` = document sha256.
2. **`GET /documents/:id/file`** (in `DocumentsController`) — owner only, streams the bytes with the stored
   content type (the editor renders it with pdf.js).
3. **`PATCH /signature-requests/:id`** — draft only (409 otherwise). `fields` replaces the whole layout
   (validate pages ≤ `pageCount`). `recipients` replaces every recipient row of the draft in one transaction
   (delete + insert, token minted per row, `email` filled when channel is email, `contact` normalized:
   lowercased email, phone digits with `+998`, telegram with `@`).
4. **`PATCH /signature-requests/:id/access`** — draft or sent. `openLinkEnabled: true` mints `publicToken`
   (32 random bytes, base64url) if missing; `false` sets it null (old open link dies; already-started copies
   keep working). `password: string` → `PasswordHasher` hash; `null` → remove and reset every row's
   `failedPasswordAttempts` to 0.
5. **`POST /signature-requests/:id/send`** — draft only. Require ≥ 1 field of type `signature`, and
   ≥ 1 recipient **or** the open link on. Set `status: 'sent'`, `sentAt`, `summariesStatus: 'queued'`.
   Enqueue `summarize-for-recipients` and `send-signing-invite` exactly like today (same job ids).
   Return `sendSigningResponse` with every `signUrl` and `openLinkUrl` (`SIGN_APP_URL/open/<publicToken>`).
6. **`POST /signature-requests/:id/recipients`** — sent only; insert rows (source `invite`), enqueue a
   per-batch invite (job id `invite.<requestId>.<firstNewRecipientId>`), return their links.
7. **`GET /signature-requests?box=sent|inbox`** — `sent`: mine, newest first, with `recipientCount` /
   `signedCount` (one grouped query, not N+1); drafts included (UI shows them as "Qoralama").
   `inbox`: sends with `status = 'sent'` where a recipient row has `email = me.email` (the "Imzolaşim kerak"
   list), with that row's status and `signUrl` so the user can open their own link.
8. **`GET /signature-requests/:id`** — detail with all recipients (`ready` = `signedPdfKey` set), newest
   signed first; include `signUrl` per row.
9. **Downloads** — `GET /signature-requests/:id/recipients/:rid/signed` and `/certificate`: owner only,
   404 until ready, `Content-Disposition: attachment; filename="<title> — <signerName>.pdf"`.
10. **`POST /signature-requests/:id/cancel`** — `status: 'cancelled'`; every link and the open link stop
    working (the public service checks status). Signed copies stay downloadable for the sender.
11. Remove the old body path: the old `create` method goes away; keep `signUrl()` helper.

## Check
- Rewrite `test/summaries-and-signing.spec.ts` parts that create requests, or add `test/signing-sender.spec.ts`:
  draft → patch → send → list → detail → cancel; DOCX draft = 415; PATCH after send = 409.

## memory/
- CHANGELOG: new sender routes (one line), `POST /signature-requests` body changed to `{documentId}` + PDF only.
- STATE: "Works now" line for the sender signing API.
