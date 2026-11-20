# Phase 06 — Public signing API

**Goal:** everything a person with a link (and maybe a password) needs: unlock, view, summary, PDF, submit,
status, downloads — plus the open link "start" route.

All routes `@Public()`, in `src/signing/`. **Every failure is the same `notValid()` 404** (unknown token,
cancelled, draft, already signed where it matters, bad body) — except a wrong password (401) and a locked row
(423), because the person must be told.

## Copy from tech award
- `TA/apps/api/src/modules/signing/signing.controller.ts` — `TOKEN_SHAPE`, `badToken`, `clientIp`
  (`x-client-ip` header), `userAgent`, `Cache-Control: no-store` on every route.
- `TA/apps/api/src/modules/signing/signing.service.ts` — `loadForToken`, `view`, `readDocument`, `submit`,
  `completedStatus`, `readCompleted`. Drop routing (`advanceEnvelope`), tenant resolvers, consent as a separate
  call (lex takes `agreed: true` in submit).

## Steps
1. **Loader** `loadForToken(token, ticket?)` → `{ recipient, request }` joined. Fails for unknown token,
   request not `sent` (draft or cancelled).
   If `request.passwordHash` is set and the ticket is missing/invalid → `locked` result.
2. **Ticket** (`signing/ticket.ts`): `issue(token)` = `<exp>.<base64url hmac-sha256(token + '.' + exp)>` with
   `SIGN_TICKET_SECRET` (new env, zod min 32 chars, dev default allowed), 2 h; `verify(token, ticket)` with
   `timingSafeEqual`.
3. **`POST /sign/:token/unlock` `{password}`** — locked row (`failedPasswordAttempts >= 10`) → 423.
   Wrong → increment, 401. Right → reset to 0, return `{ ticket }`.
4. **`GET /sign/:token`** — locked → `{ locked: true, title }`. Otherwise `signerView`
   (`senderName` from the creator's `fullName`); first open sets `status: 'viewed'`, `viewedAt`,
   viewed IP / UA. A signed row still returns the view with `signed: true` (the page shows "done +
   download"), so the link can be opened again after signing.
5. **`GET /sign/:token/summary`** — rework `summaryForToken`: read the send's single summary
   (`recipient_summaries.signatureRequestId`); no summary → 404 and the page skips the step
   (`hasSummary` in the view tells it up front). Needs the ticket too when a password is set.
6. **`GET /sign/:token/document`** — original PDF bytes (`application/pdf`, inline).
7. **`POST /sign/:token/submit`** — not signed yet (else 404), `agreed: true`; validate `fieldValues` with
   `field-values.ts` (phase 04) against the send's `fields`; check the PNG (`png-bytes.ts`), store it at
   `signatures/<requestId>/<recipientId>.png`. One update, guarded with `where status != 'signed'` so a
   double click can't sign twice: `status: 'signed'`, `signedAt`, `consentAt`, `signerName`,
   `signatureMethod`, `signatureImageKey`, `fieldValues` (incl. server-filled `date`), signer IP / UA.
   Then enqueue `complete-submission` (phase 07; until then, just leave a TODO log). Return `{ ok: true }`.
8. **`GET /sign/:token/status`** → `{ ready }`; **`/signed`** and **`/certificate`** → the files, only for
   this row and only once ready.
9. **Open link**
   - `GET /sign/open/:publicToken` → `{ title, senderName, needsPassword }` (send must be `sent` and
     `openLinkEnabled`).
   - `POST /sign/open/:publicToken/start` `{ name, phone?, password? }` → if a password is set it must match
     (wrong → 401; no per-row counter here, rate limiting is "Later"). Insert a recipient
     (`source: 'open_link'`, `channel: 'link'`, `fullName: name`, `contact: phone`, fresh token) and return
     `{ token, ticket? }`. The page then goes to `/sign/<token>`.
10. CORS: the sign app talks through its own pass-through (phase 10), so no CORS change is needed.

## Check
- `test/signing-public.spec.ts`: view → submit → second submit 404; cancelled send → 404; password: locked view,
  wrong ×10 → 423, right → ticket works; open link start creates a row; missing required field → 404.

## memory/
- CHANGELOG: public signing routes, `SIGN_TICKET_SECRET` env. STATE: what a signer can do now.
