# apps/api — backend + AI pipeline

NestJS (port 5000). Owns the sender API, the AI review pipeline, the BullMQ
jobs and the public signing summary route. See [`../../CLAUDE.md`](../../CLAUDE.md)
for the repo rules and [`../../ROADMAP.md`](../../ROADMAP.md) for the plan.

## Running it

```bash
cp .env.example .env         # then fill OPENAI_API_KEY
pnpm install                 # from the repo root
pnpm services:up             # Postgres 5434 + Redis 6391, from the root
pnpm db:migrate              # from the root
pnpm dev:api                 # from the root
```

Without `OPENAI_API_KEY` everything boots, but a review job fails and the
review is marked `failed` with "OPENAI_API_KEY is not set".

Two models: the **review** and **revise** calls run on `AI_MODEL` at
`AI_EFFORT`, and **classify** and the **recipient summaries** run on
`AI_MODEL_LIGHT` at medium effort. Measured on 2026-11-21 (`gpt-5` /
`gpt-5-mini`, effort `high`): **~$0.17 and ~3 minutes per document** — classify
20s/$0.003, review 165s/$0.165 — and a scanned PDF took 470s, because the model
reads the page images. Classify reads the whole document, so that
split is the biggest cost lever here; set `AI_MODEL_LIGHT` to the same value as
`AI_MODEL` and re-run `pnpm eval:review` to see what it costs in quality.

Until `pnpm ingest:hf` has loaded the law tables, the law search uses the
fixtures in `src/law-search/fixtures/`. `LAW_SEARCH_MODE` forces one side
(`auto` | `db` | `fake`).

```bash
pnpm seed:demo               # a sender, a finished review, a signing link
pnpm eval:review             # review quality (spends tokens — see eval/ai-review/README.md)
pnpm --filter api test       # in-process Postgres, no Docker needed
```

Every test file starts its own in-process Postgres, so on a small laptop run
`pnpm --filter api test -- --maxWorkers=2` (the flag belongs to vitest, not to
turbo, so `pnpm test --maxWorkers=2` at the root is rejected).

## The API

`packages/contracts/src/ai.ts` is the source of truth for every shape, and
`packages/contracts/mocks/` holds a sample response per route. Those are what
the frontend builds against; changes to them are add-only.
[`docs/ai-frontend-handoff.md`](../../docs/ai-frontend-handoff.md) is the same
thing written for the frontend team: statuses to poll, upload errors, clause
highlighting and the signing summary.

| Method + path                    | Body                                             | Response                        |
| -------------------------------- | ------------------------------------------------ | ------------------------------- |
| `POST /documents`                | multipart `file` (PDF, DOCX, text; ≤ 20 MB)      | `DocumentWire`                  |
| `GET /documents/:id`             | —                                                | `DocumentWire`                  |
| `GET /documents/:id/versions`    | —                                                | `DocumentVersionWire[]`         |
| `GET /documents/:id/parties`     | —                                                | `PartyWire[]`                   |
| `POST /documents/:id/reviews`    | `{ language? }`                                  | `{ reviewId }`                  |
| `GET /documents/:id/reviews`     | —                                                | `ReviewWire[]`                  |
| `GET /reviews/:id`               | —                                                | `ReviewWire`                    |
| `POST /reviews/:id/messages`     | `{ text }`                                       | `{ messageId }`                 |
| `GET /reviews/:id/messages`      | —                                                | `ReviewMessageWire[]`           |
| `POST /reviews/:id/edits/accept` | `{ editIds }`                                    | `{ documentId, version }`       |
| `POST /reviews/:id/edits/reject` | `{ editIds }`                                    | `{ rejected }`                  |
| `POST /signature-requests`       | `{ documentId, recipients[], summaryLanguage? }` | ids + signing links             |
| `GET /sign/:token/summary`       | —                                                | `RecipientSummaryWire` (public) |
| `GET /me/ai-usage`               | —                                                | `AiUsageWire`                   |

Async by design: a POST enqueues a job and returns an id; poll the matching GET
every couple of seconds. `status` goes `queued → running → done | failed`.

**Identity.** Every sender route needs `Authorization: Bearer <accessToken>`
from `POST /auth/login`; `CurrentUserGuard` then loads the user row.
`GET /sign/:token/summary` is `@Public()` and needs no header.

Errors the frontend branches on: `402 REVIEW_LIMIT_REACHED`,
`422 EDITS_NEED_DOCX`, `422 EDIT_NOT_APPLICABLE`, `409 NOT_LATEST_VERSION`,
and `501 EDITS_NOT_AVAILABLE` when the backend runs the stand-in document
processing (`LAW_SEARCH_MODE=fake`), which cannot edit a DOCX.

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
| `src/ai-review/mappers.ts`                                  | Wire objects, built field by field                                |
| `src/law-search/`                                           | Law search for the review (`LawModule` in-process) + the fixtures |
| `src/documents/`, `src/signature-requests/`, `src/signing/` | Upload, send, the public summary route                            |
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
