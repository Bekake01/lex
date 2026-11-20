# Current state

Edit in place to keep this current.

## Works now

- Monorepo: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), `apps/lex-api` (law service, 5001), packages `@lex/contracts` and `@lex/crypto`, pnpm + turbo.
- Infra: Postgres (Docker, 5434) + **Redis (Docker, 6379, BullMQ)** → `pnpm services:up`. Drizzle migrations `0000_init`, `0001_ai_tables`.
- Database tables: `agencies`, `users`, `sessions`, `email_codes` (auth schema only, login not implemented), `documents`, `ai_reviews`, `ai_issues`, `ai_review_messages`, `ai_edits`, `signature_requests`, `recipients`, `recipient_summaries`, `ai_usage`.
- **AI review pipeline** (`apps/api/src/ai-review/`): upload → `analyze-document` job (extract → classify → law search → review → server-side citation check → save) → poll `GET /reviews/:id`. Correction chat → `revise-document` job → validated edits → accept → new document version + automatic re-review. Send → `summarize-for-recipients` job → `GET /sign/:token/summary` (uniform 404, reads stored rows, never calls Claude).
- Model settings: `claude-opus-5-5`, adaptive thinking, structured output with Zod, prompt caching on the system prompt, server-side refusal fallbacks; effort `high` for the review, `medium` for classify and summaries.
- Law data: calls `apps/lex-api` when `LEX_API_KEY` is set, otherwise fixture articles (`LAW_SEARCH_MODE=auto|fake|lex`). lex-api itself: setup, API key guard, pgvector schema, Uzbek text utils, HF import (54k articles).
- Review eval harness: `pnpm eval:review` (citation accuracy ≥ 95%, issue precision ≥ 80%; labels each dropped citation `retrieval` or `model`). Three synthetic starter cases.
- For the frontend: `packages/contracts/src/ai.ts` + `packages/contracts/mocks/*.json` (validated against the schemas in CI), and `pnpm seed:demo` for a seeded sender, finished review, proposed edit and signing link.
- `apps/api`: 98 tests (in-process Postgres via PGlite — no Docker needed to run them).

## In progress

- `apps/lex-api` `/search`, embeddings and `/documents/extract` · law-data track. Until those land, `apps/api` uses the fixtures.
- Login / sessions / Resend · auth track. The AI routes go through `CurrentUserGuard`, which today accepts a dev `x-user-id` header outside production; swap its body when real auth lands, no route changes.
- `apps/web` review screen, `apps/sign` summary step · frontend team. They need `GET /sign/:token/summary` in the sign relay allowlist.
- Emails: `send-signing-invite` marks the request sent and logs the links; Resend delivery is the email track's.
- Signing itself (consent, stamp, seal, certificate): `@lex/crypto` provides the hashing and the "Summary shown to signer: sha256 …" line, nothing renders a certificate yet.

## Decisions

- Ports: web 3000, sign 3001, api 5000, lex-api 5001, Postgres 5434, Redis 6379 (lex-api's own pgvector Postgres: 5433).
- Users: one table; `agency_id` null = individual, else member of exactly one agency. Receivers who sign by link are not users.
- ORM Drizzle, Postgres 18 (`uuidv7()`), camelCase in TS / snake_case in SQL.
- Jobs: BullMQ, workers in the API process for now; every job idempotent (ids only in the payload, `jobId` makes enqueue idempotent too).
- Document bytes on local disk behind `StorageService` (swap in S3/R2 later); `documents.extracted_text` caches A's extraction.
- Never modify an original: an accepted edit writes version + 1 with a new sha256, and only the latest version can be sent.
- The server decides citations: an `articleId` Claude did not receive becomes `citation: null`, and the finding keeps its text.
- Snapshot, don't reference: `signature_requests.document_hash` + `summary_hash`, and `recipient_summaries.summary_hash` per signer.
- Plan limits checked at enqueue: individual per user, agency pooled (`ai_usage.scope_key`), 402 with `REVIEW_LIMIT_REACHED`.
- `AI_PROMPT_VERSION` is part of a review's idempotency key, so old reviews keep the prompt they ran under.
- Hackathon MVP: no RLS, no tenant isolation (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
