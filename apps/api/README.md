# apps/api — backend + AI pipeline

NestJS (port 5000). Owns the sender API, the AI review pipeline, the BullMQ
jobs and the public signing summary route. See [`../../CLAUDE.md`](../../CLAUDE.md)
for the repo rules and [`../../ROADMAP.md`](../../ROADMAP.md) for the plan.

## Running it

```bash
cp .env.example .env         # then fill ANTHROPIC_API_KEY
pnpm install                 # from the repo root
pnpm services:up             # Postgres 5434 + Redis 6379, from the root
pnpm db:migrate              # from the root
pnpm dev:api                 # from the root
```

Without `ANTHROPIC_API_KEY` everything boots, but a review job fails and the
review is marked `failed` with "ANTHROPIC_API_KEY is not set".

Until `pnpm ingest:hf` has loaded the law tables, the law search uses the
fixtures in `src/law-search/fixtures/`. `LAW_SEARCH_MODE` forces one side
(`auto` | `db` | `fake`).

```bash
pnpm seed:demo               # a sender, a finished review, a signing link
pnpm eval:review             # review quality (spends tokens — see eval/ai-review/README.md)
pnpm --filter api test       # 98 tests, in-process Postgres, no Docker needed
```

## The API

`packages/contracts/src/ai.ts` is the source of truth for every shape, and
`packages/contracts/mocks/` holds a sample response per route. Those are what
the frontend builds against; changes to them are add-only.

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
`422 EDITS_NEED_DOCX`, `422 EDIT_NOT_APPLICABLE`, `409 NOT_LATEST_VERSION`.

## Layout

| Path                                                        | What                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/ai-review/ai.service.ts`                               | The only place that calls Claude                                  |
| `src/ai-review/prompts.ts`                                  | Every prompt; bump `AI_PROMPT_VERSION` when you change one        |
| `src/ai-review/schemas.ts`                                  | Zod schemas for the model's structured output                     |
| `src/ai-review/citations.ts`                                | Drops any citation that was not retrieved                         |
| `src/ai-review/jobs/`                                       | `analyze-document`, `revise-document`, `summarize-for-recipients` |
| `src/ai-review/mappers.ts`                                  | Wire objects, built field by field                                |
| `src/law-search/`                                           | Law search for the review (`LawModule` in-process) + the fixtures |
| `src/documents/`, `src/signature-requests/`, `src/signing/` | Upload, send, the public summary route                            |
| `src/usage/`                                                | Metering and plan limits                                          |
| `src/db/schema/`                                            | Drizzle tables, one file each                                     |
| `eval/ai-review/`                                           | Review quality harness and its cases                              |

## Rules that are easy to break

- Only `ai.service.ts` touches the Anthropic SDK.
- Contract text is data, never instructions. A finding with no supporting
  retrieved article gets `citation: null` — never a guessed article number.
- Nothing heavy on the request path: AI work is a job, and jobs carry ids only
  so a re-delivery is a no-op.
- The signing path never calls Claude.
- Never modify an original document: an accepted edit writes version + 1.
- No prompt, model output, document text, API key or storage key in a response
  or a log line.
