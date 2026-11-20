# Phase 02 — Database (migration `0006_signing`)

**Goal:** the tables hold one send → many per-person copies, plus open link and password.

## Steps
1. `apps/api/src/db/schema/enums.ts`
   - `signatureRequestStatus`: add `draft` (keep `pending` / `completed` in the enum; Postgres can't drop values
     easily — just stop using them).
   - new `deliveryChannel` = `email, telegram, sms, link`; new `recipientSource` = `invite, open_link`.
2. `signature-requests.ts` — add:
   - `title` text not null, `message` text, `partyName` text
   - `fields` jsonb `$type<SigningField[]>()` not null default `[]`
   - `pageCount` integer, `pageSizes` jsonb `$type<{ w: number; h: number }[]>()`
   - `openLinkEnabled` boolean not null default false, `publicToken` text unique, `passwordHash` text
   - default `status` becomes `draft`; keep `documentHash` (set from the document at draft creation)
   - index on `(createdByUserId, createdAt)`
3. `recipients.ts`:
   - `email` and `fullName` → nullable. Change the email check to `email is null or email = lower(trim(email))`.
   - add `channel` (not null default `link`), `contact` text, `source` (not null default `invite`)
   - add `signerName`, `fieldValues` jsonb not null default `{}`, `signatureMethod`, `signatureImageKey`,
     `consentAt`, `signerIp`, `signerUserAgent`
   - add `signedPdfKey`, `certificateKey`, `signedHash`, `sealSignature`, `sealKid`
   - add `failedPasswordAttempts` integer not null default 0
   - index on `(email)` for the inbox query
   - `token` stays plain, unique, minted at insert (a draft's tokens just don't work until the send is `sent`).
4. `recipient-summaries.ts`: `recipientId` → nullable (drop its unique), add unique on `signatureRequestId`
   (one summary per send). Tell the AI track (zuhriddin) — the job changes in phase 07.
5. `pnpm db:generate` → read the SQL (check the enum `ADD VALUE`, the dropped/added uniques, the nullable
   changes) → `pnpm db:migrate`. Rename the file to `0006_signing.sql` if drizzle gave it a random name
   (and fix `meta/_journal.json` to match).
6. Fix compile errors the new nullable columns cause in current code (`signature-requests.service.ts`,
   `summarize-for-recipients.processor.ts`, `signing.service.ts`, `seed-demo.ts`) — just enough to compile;
   those files are reworked in 05–07.

## Check
- `pnpm db:migrate` works on a fresh DB (`pnpm db:down && pnpm db:up`, then migrate) and on the current one.
- `pnpm --filter api build` (or `tsc --noEmit`) compiles.

## memory/
- CHANGELOG: **migration 0006 — run `pnpm db:migrate`**; list the new columns in one line.
- STATE: update the migration list and the table list.
