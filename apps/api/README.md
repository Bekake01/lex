# apps/api — backend + AI pipeline

NestJS (port 5000). Owns the sender API, the AI review pipeline, the BullMQ
jobs and the public signing summary route.

## Running it

```bash
cp .env.example .env         # then fill OPENAI_API_KEY and SEAL_KEYS
pnpm install                 # from the repo root
pnpm services:up             # Postgres 5434 + Redis 6391, from the root
pnpm db:migrate              # from the root
pnpm dev:api                 # from the root
```

Without `OPENAI_API_KEY` everything boots, but an AI job fails and the review
(or answer) is marked `failed` with "OPENAI_API_KEY is not set".

Two models: the **review** and **revise** calls run on `AI_MODEL` at
`AI_EFFORT`, and **classify**, the **recipient summaries** and the **legal
Q&A** run on `AI_MODEL_LIGHT`. Measured with `gpt-5` / `gpt-5-mini` at effort
`high`: **~$0.17 and ~3 minutes per contract review** (classify 20s/$0.003,
review 165s/$0.165); a scanned PDF took 470s, because the model reads the page
images. Set `AI_MODEL_LIGHT` to the same value as `AI_MODEL` and re-run
`pnpm eval:review` to see what the split costs in quality.

Until `pnpm ingest:hf` has loaded the law tables, the law search uses the
fixtures in `src/law-search/fixtures/`. `LAW_SEARCH_MODE` forces one side
(`auto` | `db` | `fake`).

```bash
pnpm ingest:hf               # load the Uzbek law corpus (~54k articles) into Postgres
pnpm eval:review             # review quality (spends tokens — see eval/ai-review/README.md)
pnpm --filter api test       # unit + integration tests, in-process Postgres, no Docker needed
pnpm --filter api test:e2e   # boots the whole app; needs `pnpm services:up`
```

Every test file starts its own in-process Postgres (PGlite), so on a small
laptop run `pnpm --filter api test -- --maxWorkers=2`.

## The API

`packages/contracts/src/` (`ai.ts`, `signing.ts`, `billing.ts`) is the source of
truth for every shape, and `packages/contracts/mocks/` holds a sample response
per route; `test/contract-mocks.spec.ts` keeps the two in step.

Every route needs `Authorization: Bearer <accessToken>` from `POST /auth/login`
unless marked public.

**Auth and account**

| Route                                                        | What                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `POST /auth/register`, `/auth/login` (public)                | Account + session; the refresh token is an httpOnly cookie |
| `POST /auth/refresh`, `/auth/logout` (public)                | Rotate / end the session                              |
| `GET /me`, `GET /me/ai-usage`                                | The signed-in user, this period's AI usage            |

**Documents and the AI review**

| Route                                       | What                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| `POST /documents`                           | Upload a contract (multipart `file`: PDF, DOCX, text; ≤ 20 MB) |
| `GET /documents`, `GET /documents/:id`      | My documents (latest versions) / one document               |
| `GET /documents/:id/file`, `/text`, `/versions` | Original bytes, extracted text + clause offsets, versions |
| `POST /documents/:id/reviews`               | Start a review → `{ reviewId }` (402 when the plan's checks are used up) |
| `GET /documents/:id/reviews`, `GET /reviews/:id` | Poll until `status` is `done` or `failed`              |
| `GET /documents/:id/parties`                | Contract parties the review found                           |
| `POST /reviews/:id/messages`, `GET …/messages` | Correction chat: ask for a change → proposed edits       |
| `POST /reviews/:id/edits/accept`, `/reject` | Accept → a new DOCX version + an automatic re-review        |

**Legal Q&A (`/ask`)**

| Route                            | What                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `POST /legal-chats`              | First question → `{ chatId, messageId }`                    |
| `POST /legal-chats/:id/messages` | Follow-up question in the same chat                         |
| `GET /legal-chats/:id`           | Poll until no answer is `pending`                           |
| `GET /legal-chats`               | Recent chats for the sidebar                                |

**Sending for signature**

| Route                                                      | What                                               |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `POST /signature-requests`, `PATCH /signature-requests/:id` | Draft from a PDF; fields, people, title, message |
| `PATCH /signature-requests/:id/access`                     | Open link on/off, password                         |
| `POST /signature-requests/:id/send`                        | Send → every signing link                          |
| `POST …/:id/recipients`, `POST …/:id/cancel`               | Add people after sending, cancel                   |
| `GET /signature-requests?box=sent\|inbox`, `GET …/:id`     | Lists and detail                                   |
| `GET …/:id/recipients/:rid/signed`, `…/certificate`        | A signed copy and its certificate                  |

**Signing (public, by link)**

| Route                                                  | What                                              |
| ------------------------------------------------------ | ------------------------------------------------- |
| `GET /sign/:token`, `POST /sign/:token/unlock`         | What to sign; password → a ticket                 |
| `GET /sign/:token/summary`, `GET /sign/:token/document` | Plain-language summary (stored, no model call), the PDF |
| `POST /sign/:token/submit`, `GET /sign/:token/status`  | Fields + signature, once; sealing status          |
| `GET /sign/:token/signed`, `/certificate`              | The sealed copy and its certificate               |
| `GET /sign/open/:publicToken`, `POST …/start`          | Open link: anyone gets their own copy             |

**Billing and team** (test payments only: checkout starts the plan at once)

| Route                                                         | What                                  |
| ------------------------------------------------------------- | ------------------------------------- |
| `GET /billing/plans`, `GET /billing/me`, `GET /billing/payments` | Plans, my plan + usage, payments   |
| `POST /billing/checkout`, `/cancel`, `/resume`, `PATCH /billing/seats` | Buy, cancel, resume, seats   |
| `GET /team`, `POST /team/invites`, `DELETE /team/invites/:id`, `PATCH`/`DELETE /team/members/:id` | Company team |
| `GET /invites/:token` (public), `POST /invites/:token/accept` | Join a company                        |

**Law index**: `POST /law/search`, `POST /law/articles/batch`, `GET /law/meta`;
`GET /health` reports the database and the law index date (public).

Async by design: a POST that needs the model enqueues a BullMQ job and returns
an id; poll the matching GET every couple of seconds.

Errors the frontend branches on: `402 REVIEW_LIMIT_REACHED`,
`422 EDITS_NEED_DOCX`, `422 EDIT_NOT_APPLICABLE`, `409 NOT_LATEST_VERSION`,
`409 DOCUMENT_NOT_READ`.

**Clauses.** Once a document has been read, `DocumentWire.clauses` carries the
document's own numbering (`4.2`, `7-modda`) with the offsets each clause takes
in the extracted text, and an issue carries `clauseRange` when its `clauseRef`
matched one of them. No `clauseRange` means the model named a clause the
document does not have: show the ref, but do not try to highlight it.

## Layout

| Path                                                        | What                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/ai-review/ai.service.ts`                               | The only place that calls the AI model (OpenAI)                   |
| `src/ai-review/prompts.ts`                                  | Every prompt; bump `AI_PROMPT_VERSION` when you change one        |
| `src/ai-review/schemas.ts`                                  | Zod schemas for the model's structured output                     |
| `src/ai-review/citations.ts`                                | Drops any citation that was not retrieved                         |
| `src/ai-review/clauses.ts`                                  | Resolves a model `clauseRef` to the document's own numbering      |
| `src/ai-review/jobs/`                                       | `analyze-document`, `revise-document`, `summarize-for-recipients` |
| `src/legal-qa/`                                             | Legal Q&A chat routes and the `answer-question` job               |
| `src/ai-review/mappers.ts`                                  | Wire objects, built field by field                                |
| `src/law-search/`                                           | Law search for the review (`LawModule` in-process) + the fixtures |
| `src/law/`                                                  | Law index: import, keyword + vector search, nightly lex.uz sync   |
| `src/documents/`, `src/signature-requests/`, `src/signing/` | Upload, send, the public signing routes, sealing                  |
| `src/usage/`                                                | Metering and plan limits                                          |
| `src/db/schema/`                                            | Drizzle tables, one file each                                     |
| `eval/ai-review/`                                           | Review quality harness and its cases                              |

## Rules that are easy to break

- Only `ai.service.ts` and `ai-errors.ts` import `openai`.
- Contract text is data, never instructions. A finding with no supporting
  retrieved article gets `citation: null` — never a guessed article number.
- Nothing heavy on the request path: AI work is a job, and jobs carry ids only
  so a re-delivery is a no-op.
- The signing path never calls the AI model.
- Never modify an original document: an accepted edit writes version + 1.
- No prompt, model output, document text, API key or storage key in a response
  or a log line.
