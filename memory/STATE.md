# Current state

Edit in place to keep this current.

## Works now
- Monorepo: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), packages `@lex/contracts` and `@lex/crypto`, pnpm + turbo.
- Infra: Postgres + pgvector (Docker, 5434) + **Redis (Docker, 6391, BullMQ)** → `pnpm services:up`. Drizzle migrations `0000_init`, `0001_pgvector`, `0002_law`, `0003_law_article_parts`, `0004_ai_tables`, `0005_issue_clause_offsets`.
- Database tables: `agencies`, `users`, `sessions`, `email_codes` (forgot password / Resend not implemented yet), `law_acts`, `law_articles`, `law_sync_runs`, `documents`, `ai_reviews`, `ai_issues`, `ai_review_messages`, `ai_edits`, `signature_requests`, `recipients`, `recipient_summaries`, `ai_usage`.
- Login (`apps/api/src/auth/`, `apps/web` `/login`): login / refresh / logout + `GET /me`, global access-token guard (`@Public()` to opt out). Team accounts via `pnpm db:seed` (Bekzod, Malika, Zuxriddin, Quvomiddin; password = email part before `@`). No sign-up page, no forgot password yet. The AI routes use `CurrentUserGuard`, which loads the user from the JWT.
- Law (in `apps/api/src/law/`, merged from lex-api): pgvector tables, Uzbek text utils, Hugging Face import (`pnpm ingest:hf`, 54k articles), keyword search (`POST /law/search`, `/law/articles/batch`, `GET /law/meta`; `SearchService` exported from `LawModule` for the AI review). `GET /health` reports db + law index date. Long articles/acts split into parts (≤ ~1,600 tokens, `parent_id`). Search eval: 102 queries, keyword R@10 91.3% on codes + laws (`docs/decisions/embeddings.md`). Contract reading (PDF / DOCX / text, scanned-PDF detection, language) and clause splitting. DOCX edits (accept → new version). Not yet: embeddings (Phase 8).
- **AI review pipeline** (`apps/api/src/ai-review/`): upload → `analyze-document` job (extract → classify → law search → review → server-side citation check → save) → poll `GET /reviews/:id`. Correction chat → `revise-document` job → validated edits → accept → new document version + automatic re-review. Send → `summarize-for-recipients` job → `GET /sign/:token/summary` (public, uniform 404, reads stored rows, never calls Claude).
- Law search for the review: in-process `LawModule` when the law tables have data, fixture articles otherwise (`LAW_SEARCH_MODE=auto|db|fake`). Document extraction: text + PDF stand-in (DOCX not yet).
- Model settings: OpenAI Responses API, `AI_MODEL` (default `gpt-5`), reasoning effort `high` for the review and `medium` for classify and summaries, strict JSON Schema from the Zod schemas plus Zod re-validation, refusal / incomplete handled, `store: false`, automatic prompt caching (`prompt_cache_key` per call type).
- Review eval harness: `pnpm eval:review` (citation accuracy ≥ 95%, issue precision ≥ 80%). Three synthetic starter cases.
- For the frontend: **`docs/ai-frontend-handoff.md`** (routes, polling, 413/415, clause highlighting, signing summary), `packages/contracts/src/ai.ts` + `packages/contracts/mocks/*.json`, and `pnpm seed:demo` (login `demo@lex.local` / `demo`) for a seeded sender, finished review, proposed edit and signing link.
- `apps/web` UI (demo data, no API yet; all under `(app)/`, needs login): `/contracts` inbox of contracts sent to the user, `/review` (auto AI review → risk + issues with lex.uz cites → AI change suggestions → request changes or sign in a dialog).
- `apps/web` `/` (home): general legal Q&A chat (`?q=` prefills) (demo keyword answers in `src/lib/legalQa.ts`: assault, labor, moral damage, statement template, fallback).
- `apps/sign` UI (demo data): `/sign/[token]` summary → obligations → typed name + drawn signature + consent → signed screen.
- Demo shapes live in `apps/*/src/lib/demo.ts`; agree these with backend before wiring the API.

## In progress
- Law Phases 8–9 code done: hybrid search (keyword + Voyage) and core laws from lex.uz with anchors per contract type. Waiting for the MacBook run (Job E: ingest:hf → ingest:core → ingest:embed → eval). Next: Phase 10 tuning · AI team (zuhriddin). Plan: `docs/LOCAL-PLAN.md`.
- `apps/web` review screen, `apps/sign` summary step · frontend team. They need `GET /sign/:token/summary` in the sign relay allowlist.
- Emails: `send-signing-invite` marks the request sent and logs the links; Resend delivery is the email track's.
- Signing itself (consent, stamp, seal, certificate): `@lex/crypto` provides the hashing and the "Summary shown to signer: sha256 …" line, nothing renders a certificate yet.
- Frontend UI (demo data) → wire to the API (`packages/contracts`, `pnpm seed:demo`) · frontend (Malika)

## Decisions
- Ports: web 3000, sign 3001, api 5000, Postgres 5434, Redis 6391.
- Users: one table; `agency_id` null = individual, else member of exactly one agency. Receivers who sign by link are not users. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- ORM: Drizzle (not Prisma), Postgres 18 (`uuidv7()`), camelCase in TS / snake_case in SQL. Image `pgvector/pgvector:pg18`; one database for users, law data and AI rows.
- One backend only (`apps/api`). lex-api was merged in on 2026-11-20; the AI review calls `SearchService` in-process, no HTTP hop. Env is validated with zod in `src/config/env.ts`.
- `/law/*` is `@Public()` for now (AI team curl testing); put it behind login later.
- Jobs: BullMQ, workers in the API process for now; every job idempotent (ids only in the payload, `jobId` makes enqueue idempotent too).
- Document bytes on local disk behind `StorageService` (swap in S3/R2 later).
- Never modify an original: an accepted edit writes version + 1 with a new sha256, and only the latest version can be sent.
- The server decides citations: an `articleId` the model did not receive becomes `citation: null`, and the finding keeps its text.
- Snapshot, don't reference: `signature_requests.document_hash` + `summary_hash`, and `recipient_summaries.summary_hash` per signer.
- Plan limits checked at enqueue: individual per user, agency pooled (`ai_usage.scope_key`), 402 with `REVIEW_LIMIT_REACHED`.
- `AI_PROMPT_VERSION` is part of a review's idempotency key, so old reviews keep the prompt they ran under.
- UI language: Uzbek in the **new Latin alphabet** (ş ç ğ ö, ʼ). Login form / SessionGate texts (auth team files) are still English.
- Users don't upload contracts in `apps/web`; contracts arrive from the backend. User reviews with AI, then signs or requests changes.
- Scope: besides contract review, users can ask general legal questions ("what happens / where do I go"). Answer shape: summary · consequences+cites · steps · contacts · optional template.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
