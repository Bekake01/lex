# Phase 10 — Sign app (`apps/sign`)

**Goal:** a person opens `/sign/<token>` (or `/open/<publicToken>`), passes the password if there is one,
reads the AI summary, fills the fields on the PDF, signs, and downloads their own sealed copy.

## Copy from tech award
| From `TA/apps/sign/` | To `apps/sign/src/` |
|---|---|
| `app/relay/[...path]/route.ts` | `app/api/[...path]/route.ts` (pass-through, see step 1) |
| `app/sign/[token]/ceremony.tsx` | `components/sign/Ceremony.tsx` (PDF + fields to fill) |
| `app/sign/[token]/adopt-signature-dialog.tsx` | `components/sign/AdoptSignature.tsx` (typed / drawn / uploaded) |
| `app/sign/[token]/completion-flow.tsx` | `components/sign/Completion.tsx` (wait for ready, downloads) |
| `lib/sign-fields.ts`, `lib/signature-image.ts` | `lib/` |
| `TA/apps/web/lib/use-pdf.ts` + `pdf-page.tsx` | reuse the phase 08 versions (copy; the apps share no UI package) |

## Steps
1. **Pass-through** `app/api/[...path]/route.ts`: GET + POST only, path must start with `sign/`; forwards to
   `API_URL`, passes `x-sign-ticket`, sets `x-client-ip` from `x-forwarded-for` (first hop) and the user
   agent; streams the response body + content type + content-disposition back. No relay secret, no edge rate
   limit (Later). Browser code only calls `/api/sign/...`.
2. `pnpm --filter sign add pdfjs-dist @lex/contracts` (workspace).
3. **`/sign/[token]` page flow** (rework `components/SigningFlow.tsx`, keep its stepper look):
   0. Load `GET /api/sign/<token>`. `{locked: true}` → **Parol** screen (`POST …/unlock`; 401 "Parol
      notoğri", 423 "Juda köp uriniş — yuboruvçiga murojaat qiling"); keep the ticket in `sessionStorage`
      (`lex-ticket:<token>`) and send it on every call. `signed: true` → jump to the done screen.
      `cancelled` / 404 → one friendly "Havola yaroqsiz" page.
   1. **Xulosa** — the AI summary (existing step; from `GET …/summary`). Skipped when `hasSummary` is false.
   2. **Hujjat** — `Ceremony`: PDF pages with the fields; required ones marked; "Keyingi maydon" button jumps
      through them; date-signed shows "imzolaganda qöyiladi"; image fields open `AdoptSignature`. Same input
      rules as the server (`fieldValueProblem` from `@lex/contracts`).
   3. **Imzo** — typed name (`signerName`, prefilled from the invite name if any), the adopted signature
      preview, consent checkbox ("Elektron imzolaşga roziman…"). **Imzolaş** → `POST …/submit`.
   4. **Tayyor** — `Completion`: polls `GET …/status` every 2 s, then **Nusxani yuklab oliş** and
      **Sertifikat** (`/api/sign/<token>/signed`, `/certificate`).
4. **`/open/[publicToken]` page**: load `GET /api/sign/open/<publicToken>`; form: Ism familiya (required),
   Telefon (optional), Parol (only if `needsPassword`) → `POST …/start` → store the ticket under the new token
   → `router.replace('/sign/<token>')`.
5. Remove `lib/demo.ts` usage from the flow once the API is merged; until then drive it with
   `packages/contracts/mocks/signer-view*.json` and `recipient-summary.json`.
6. Mobile first: most people open the link from Telegram / SMS on a phone — the PDF fits the width, fields are
   tappable, the signature pad works with touch (the copied dialog already does pointer events).

## Check
- By hand on a phone-size window: personal link without password; with password (wrong, then right);
  open link start; sign; download both files; reopen the link → done screen, not the form.

## memory/
- CHANGELOG: sign app on the API, `/open/[publicToken]`, pass-through route. STATE: sign app line.
