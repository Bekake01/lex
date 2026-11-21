# AI routes: what the frontend needs to know

For `apps/web` and `apps/sign`. Updated 2026-11-21 by the AI track.

Everything here is already live in `apps/api`. The shapes are in
[`packages/contracts/src/ai.ts`](../packages/contracts/src/ai.ts) — import the
types from `@lex/contracts`, don't retype them — and
[`packages/contracts/mocks/`](../packages/contracts/mocks/) holds one sample
response per route, so a screen can be built before the backend is reachable.
Changes to `ai.ts` are add-only: a field may appear, never change meaning.

Start the whole thing with data in it:

```bash
pnpm services:up && pnpm db:migrate && pnpm --filter api db:seed   # team logins
cd apps/api && pnpm seed:demo        # a document, a finished review, a signing link
```

`pnpm seed:demo` prints the user id, the document and review ids, a proposed
edit id and the signing link, plus curl lines that work as printed.

## Routes

| Method + path                        | Response                            |
| ------------------------------------ | ----------------------------------- |
| `POST /documents` (multipart `file`) | `DocumentWire`                      |
| `GET /documents/:id`                 | `DocumentWire`                      |
| `GET /documents/:id/versions`        | `DocumentVersionWire[]`             |
| `GET /documents/:id/parties`         | `PartyWire[]`                       |
| `POST /documents/:id/reviews`        | `{ reviewId }`                      |
| `GET /reviews/:id`                   | `ReviewWire`                        |
| `POST /reviews/:id/messages`         | `{ messageId }`                     |
| `GET /reviews/:id/messages`          | `ReviewMessageWire[]`               |
| `POST /reviews/:id/edits/accept`     | `{ documentId, version }`           |
| `POST /signature-requests`           | ids + signing links                 |
| `GET /sign/:token/summary`           | `RecipientSummaryWire` (**public**) |
| `GET /me/ai-usage`                   | `AiUsageWire`                       |

Every POST that starts AI work returns an id immediately and the work happens
in a job. Poll the matching GET every couple of seconds: `status` goes
`queued → running → done | failed`. A review of a long contract takes tens of
seconds, so the screen needs a real waiting state, not a spinner that implies
one second.

All of these except `GET /sign/:token/summary` need the access token from
`POST /auth/login` (`Authorization: Bearer …`).

## Upload errors to handle

`POST /documents` accepts PDF, DOCX and plain text up to `MAX_UPLOAD_BYTES`
(20 MB by default), and it checks the bytes, not the file name:

| Status  | Means                                                                | What to show                         |
| ------- | -------------------------------------------------------------------- | ------------------------------------ |
| **413** | Over the size limit                                                  | The server's message                 |
| **415** | Not a real PDF/DOCX/text, or the content doesn't match the extension | The server's message — it says which |
| 400     | No `file` field                                                      | A bug in the request                 |

Both used to be 400. Show the server's `message`: it is written for a user and
contains no document text.

## A failed review says why

`ReviewWire` carries a readable reason when `status` is `failed`, so show it
instead of a generic "something went wrong":

- "The PDF file could not be read; it may be damaged or password-protected"
- "The file is a PDF, not a DOCX"
- "Unsupported file type: upload a PDF, DOCX or plain-text file"
- "OPENAI_API_KEY is not set" (only before the key is configured)

These messages are safe to display: no prompt, no model output, no contract
text.

## Clauses: highlighting a finding

Once a document has been read (the first review reads it),
`DocumentWire.clauses` carries the document's own numbering with the offsets
each clause takes in the extracted text:

```ts
{ ref: '4.2', heading: 'Ijara haqi', start: 58, end: 106 }
```

An issue carries `clauseRange` when its `clauseRef` matched one of those
clauses. **No `clauseRange` means the model named a clause the document does
not have:** show `clauseRef` as text and don't try to highlight it.

`DocumentWire.scanned` is true for a PDF with no text layer. The review still
works (the model reads the file as an image), but there are no clauses and no
offsets, so a scanned document gets no highlighting.

The offsets index the extracted text. Serving that text is not a route yet —
if a screen wants to render the contract and highlight inside it, ask the AI
track and we'll add `GET /documents/:id/text` rather than you re-extracting it
in the browser.

## Errors worth a branch

| Status + code              | When                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `402 REVIEW_LIMIT_REACHED` | Monthly review quota used up; `GET /me/ai-usage` has the numbers |
| `422 EDITS_NEED_DOCX`      | Edits can only be applied to a DOCX                              |
| `422 EDIT_NOT_APPLICABLE`  | The document moved on, so the edit no longer matches             |
| `409 NOT_LATEST_VERSION`   | Only the newest version of a document can be sent                |
| `501 EDITS_NOT_AVAILABLE`  | DOCX editing is not built yet (temporary, see below)             |

The codes are in `AI_ERROR_CODES` in `@lex/contracts`.

## The signing app

`GET /sign/:token/summary` is live, public, and reads a summary written at send
time — it never calls the model, so it answers immediately. There is **one
summary per send** (not per person): `summarize-for-recipients` makes one model
call and writes one `recipient_summaries` row keyed by `signature_request_id`;
every link of that send reads it. Its `partyName` is the send's `partyName`,
else the AI review's other party, else `imzolovçi`. Unknown, cancelled and
summary-less tokens (and a password-protected link without a valid
`x-sign-ticket`) all return the **same 404**: a signing link must not reveal
whether it ever existed. `GET /sign/:token` says `hasSummary` so the page can
skip the step without asking.

`apps/sign` uses it through its own pass-through (`/api/sign/...`) in the
"Xulosa" step (`src/components/sign/SigningFlow.tsx`).

## Accepting an edit

`POST /reviews/:id/edits/accept` never modifies the original: it writes
version + 1 with a new `sha256` and `parentDocumentId`, then starts a review of
the new version automatically. The response is `{ documentId, version }` —
point the screen at the new `documentId`.

Applying edits to DOCX is being built by the law track. **Until it lands this
route answers `501 EDITS_NOT_AVAILABLE`** — show the server's message ("…not
available yet. The suggested wording is still here, and nothing was changed");
the edit stays `proposed`, so the button can be offered again later. Nothing
else in the API answers 501, and this code disappears when the feature lands.
