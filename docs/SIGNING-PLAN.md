# Signing plan: one PDF → many people → one sealed copy each

Status: **built** (2026-11-21), in 11 phases (the temporary `phases/` folder is deleted). What ended up different is in §9.

The signing part of `President-tech-award-e-signsoft` (`/Users/bek/lex/President-tech-award-e-signsoft`, "tech award" below) is
ported into lex, with a different core model and without its enterprise layers.

## 1. What we are building

- A sender uploads **one PDF**, places **fields** on it (signature, date, name, text, stamp…), adds **many people** and sends.
- Every person opens **their own link**, fills the fields on **their own copy**, signs, and submits.
- Every submission is sealed on its own: stamped PDF → SHA-256 → Ed25519 seal → certificate. The sender
  gets **all** copies back (40 people → 40 signed PDFs). A send never "completes"; it stays open until cancelled.
- **Channels** (Email / Telegram / SMS / Link only) are a choice in the UI. Our server delivers nothing yet; the
  sender copies the link or uses a share button that opens their own app (`t.me/share`, `sms:`, `mailto:`).
- **Open link** (optional, off by default): one public link; anyone opens it, types their name and gets their own copy.
- **Password** (optional, off by default): one password per send, covering every link of that send.
- **PDF only** for sending. A Word file (also a DOCX from an accepted AI edit) is converted to PDF by the user
  and uploaded again. DOCX/TXT stay accepted for the AI review.
- File bytes move to **Cloudflare R2** (local disk stays as the dev default).

## 2. How it differs from tech award

| | tech award | lex (this plan) |
|---|---|---|
| A send is | an envelope: every signer signs **the same** PDF, sealed once when all are done | a form: every person gets **their own** copy, sealed per person |
| Fields | grouped per recipient (`recipientKey`) | one set; every person fills all of them |
| Routing | parallel / sequential, signer / cc | none — everyone at once |
| Delivery | Resend email | links + share buttons; channel stored, not delivered |
| Access | token only | token, plus optional password, plus optional open link |
| Stamping font | Helvetica (WinAnsi, no ş ğ ʼ) | Noto Sans via `@pdf-lib/fontkit` |
| Signer page | ceremony only | AI summary first, then the ceremony |
| Login / DB / isolation | Clerk, Prisma, RLS | our JWT login, Drizzle, no isolation |

Not ported: Clerk, RLS / tenant layer, Prisma, billing, trial, templates + starters, folders, routing order, cc,
reminders, expiry sweeps, public verify page, i18n, security-lint, the relay secret.

## 3. Data model (migration `0006_signing`)

**`signature_requests`** — one send.
- new: `title`, `message`, `fields` (jsonb, the editor layout), `pageCount`, `pageSizes` (jsonb),
  `partyName` (which contract party the recipients are, for the AI summary),
  `openLinkEnabled` (bool, default false), `publicToken` (unique, null while off), `passwordHash` (null = no password).
- status: `draft → sent → cancelled` (enum gets `draft`; `pending` / `completed` stop being used); the `draft` default is set in JS (`$default`), because Postgres can't use a new enum value in the migration that adds it).
- `documentHash` (exists): sha256 of the PDF that was sent.

**`recipients`** — one row = **one person's copy**.
- delivery: `channel` (`email | telegram | sms | link`), `contact` (email / phone / @username), `source` (`invite | open_link`).
- `email` and `fullName` become nullable.
- submitted: `signerName`, `fieldValues` (jsonb, by field id), `signatureMethod`, `signatureImageKey`,
  `consentAt`, `signerIp`, `signerUserAgent`.
- sealed: `signedPdfKey`, `certificateKey`, `signedHash`, `sealSignature`, `sealKid`.
- `failedPasswordAttempts` (int, default 0; 10 = locked).
- status stays `pending → viewed → signed`; the copy is downloadable once `signedPdfKey` is set.

**`recipient_summaries`** — **one per send** (everyone is the same party): `recipientId` nullable,
`signatureRequestId` unique.

## 4. Routes

Sender (logged in, `CurrentUserGuard`):

| Route | |
|---|---|
| `POST /signature-requests` `{documentId}` | draft; 415 unless PDF; page count + sizes via `pdf-lib` |
| `GET /documents/:id/file` | the PDF bytes for the editor |
| `PATCH /signature-requests/:id` | title, message, partyName, fields, recipients (draft only) |
| `PATCH /signature-requests/:id/access` | `{openLinkEnabled?, password?: string \| null}` (draft or sent) |
| `POST /signature-requests/:id/send` | snapshot, queue summary + invite, return every link |
| `POST /signature-requests/:id/recipients` | add people to a sent send |
| `GET /signature-requests?box=sent\|inbox` | my sends with counts / sends where my email is a recipient |
| `GET /signature-requests/:id` | detail: fields, people, statuses, values, links |
| `GET /signature-requests/:id/recipients/:rid/signed` · `/certificate` | downloads |
| `POST /signature-requests/:id/cancel` | every link dies |

Public (signing app, token only; every failure is the same 404):

| Route | |
|---|---|
| `GET /sign/:token` | signer view (or `{locked: true}` when a password is needed) |
| `POST /sign/:token/unlock` `{password}` | → `{ticket}`; wrong → 401 + attempt counted |
| `GET /sign/:token/summary` | exists; reads the send's summary |
| `GET /sign/:token/document` | the original PDF |
| `POST /sign/:token/submit` | `{signerName, signature, fieldValues, agreed: true}` |
| `GET /sign/:token/status` · `/signed` · `/certificate` | completion + downloads |
| `GET /sign/open/:publicToken` | `{title, senderName, needsPassword}` |
| `POST /sign/open/:publicToken/start` | `{name, phone?, password?}` → own token (+ ticket) |

Password ticket: `POST …/unlock` returns `<exp>.<hmac>` (HMAC-SHA256 of `token.exp` with `SIGN_TICKET_SECRET`,
2 h). The sign app sends it as `x-sign-ticket` on every later call.

## 5. Jobs

- `summarize-for-recipients` (exists, AI track): one summary per send.
- `send-signing-invite` (exists): still logs the links, now per channel; never blocks on the summary forever.
- `complete-submission` (new, job id `complete.<recipientId>`): stamp → sha256 → seal → certificate → R2 → row.
  Idempotent: stops if `signedPdfKey` and `certificateKey` are set.

## 6. New env vars and dependencies

- `STORAGE_DRIVER=local|r2` (default `local`), `S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`, bucket `lexdoc`, default jurisdiction), `S3_REGION` (default `auto`), `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- `SEAL_KEYS` (same JSON ring format as tech award's `ESIGN_SEAL_KEYS`), `SIGN_TICKET_SECRET`.
- api: `pdf-lib`, `@pdf-lib/fontkit`, `@aws-sdk/client-s3`. crypto: `pdf-lib`, `@pdf-lib/fontkit`.
  web + sign: `pdfjs-dist`.

## 7. Decisions (2026-11-21)

- Per-person copies, not one shared envelope. No routing order, no cc.
- Open link and password are both optional and **off by default**.
- Signer identity = typed name + link (+ password if set). No SMS code.
- Sender pre-signing / company stamp on every copy → Later.
- PDF only for sending; the user converts Word → PDF themselves.
- Channels are stored and shown, not delivered (share buttons use the sender's own apps).

## 8. Phases (done)

Contracts → database → storage → crypto → sender API → public API → jobs → web editor → web people/send/detail →
sign app → end-to-end cleanup. Each one has its own `memory/CHANGELOG.md` entry ("signing phase NN").

## 9. What ended up different from this plan

- **Sign app pass-through** is a plain forward (`apps/sign/src/app/api/[...path]/route.ts`: GET + POST, `sign/…`
  paths only, passes `x-sign-ticket`, sets `x-client-ip` from the first `x-forwarded-for` hop). No relay secret,
  no edge rate limit, no structural allowlist like tech award's relay → ROADMAP "Later".
- Downloads in web and sign go fetch → blob (the bearer token / password ticket can't ride on a plain `<a href>`).
- The PDF pages in the sign app stay white in dark mode: theme tokens `paper` / `paper-ink`, and
  `data-theme="light"` on an element keeps its subtree light.
- The `complete-submission` start-up sweep logs and carries on when the DB or Redis is down (it used to stop boot).
- `pnpm seed:demo` still seeds the **old** one-recipient request on a DOCX (no fields, no PDF) — it shows the
  summary, not the new signing screens. Make a real send from the web app to demo signing.
