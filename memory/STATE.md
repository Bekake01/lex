# Current state

Edit in place to keep this current.

## Works now
- Monorepo: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), packages `@lex/contracts` and `@lex/crypto`, pnpm + turbo.
- Infra: Postgres + pgvector (Docker, 5434) + **Redis (Docker, 6391, BullMQ)** → `pnpm services:up`. Drizzle migrations `0000_init`, `0001_pgvector`, `0002_law`, `0003_law_article_parts`, `0004_ai_tables`, `0005_issue_clause_offsets`, `0006_signing`.
- Database tables: `agencies`, `users`, `sessions`, `email_codes` (forgot password / Resend not implemented yet), `law_acts`, `law_articles`, `law_sync_runs`, `documents`, `ai_reviews`, `ai_issues`, `ai_review_messages`, `ai_edits`, `signature_requests` (one send: PDF + fields, open link, password), `recipients` (one person's copy: channel, values, seal), `recipient_summaries` (one per send), `ai_usage`.
- Login (`apps/api/src/auth/`, `apps/web` `/login`): login / refresh / logout + `GET /me`, global access-token guard (`@Public()` to opt out). Team accounts via `pnpm db:seed` (Bekzod, Malika, Zuxriddin, Quvomiddin; password = email part before `@`). No sign-up page, no forgot password yet. The AI routes use `CurrentUserGuard`, which loads the user from the JWT.
- Law (in `apps/api/src/law/`, merged from lex-api): pgvector tables, Uzbek text utils, Hugging Face import (`pnpm ingest:hf`, 54k articles), keyword search (`POST /law/search`, `/law/articles/batch`, `GET /law/meta`; `SearchService` exported from `LawModule` for the AI review). `GET /health` reports db + law index date. Long articles/acts split into parts (≤ ~1,600 tokens, `parent_id`). Search eval: 102 queries, keyword R@10 91.3% on codes + laws (`docs/decisions/embeddings.md`). Contract reading (PDF / DOCX / text, scanned-PDF detection, language) and clause splitting. DOCX edits (accept → new version). Not yet: embeddings (Phase 8).
- **AI review pipeline** (`apps/api/src/ai-review/`): upload → `analyze-document` job (extract → classify → law search → review → server-side citation check → save) → poll `GET /reviews/:id`. Correction chat → `revise-document` job → validated edits → accept → new document version + automatic re-review. Send → `summarize-for-recipients` job (one summary per send) → `GET /sign/:token/summary` (public, uniform 404, reads stored rows, never calls the model).
- Law search for the review: in-process `LawModule` when the law tables have data, fixture articles otherwise (`LAW_SEARCH_MODE=auto|db|fake`). Document extraction: text + PDF stand-in (DOCX not yet).
- Model settings: OpenAI Responses API, `AI_MODEL` (default `gpt-5`), reasoning effort `high` for the review and `medium` for classify and summaries, strict JSON Schema from the Zod schemas plus Zod re-validation, refusal / incomplete handled, `store: false`, automatic prompt caching (`prompt_cache_key` per call type).
- Review eval harness: `pnpm eval:review` (citation accuracy ≥ 95%, issue precision ≥ 80%). Three synthetic starter cases.
- For the frontend: **`docs/ai-frontend-handoff.md`** (routes, polling, 413/415, clause highlighting, signing summary), `packages/contracts/src/ai.ts` + `packages/contracts/mocks/*.json`, and `pnpm seed:demo` (login `demo@lex.local` / `demo`) for a seeded sender, finished review, proposed edit and signing link.
- `apps/web` UI (all under `(app)/`, needs login): `/contracts` = Hujjatlar on real data (signing line below); `/review` is still demo data (auto AI review → risk + issues with lex.uz cites → AI change suggestions → request changes or sign in a dialog).
- `apps/web` `/` (home, centered input like Claude): general legal Q&A chat (`?q=` prefills) (demo keyword answers in `src/lib/legalQa.ts`: assault, labor, moral damage, statement template, fallback).
- `apps/sign` on the API (via its own pass-through `/api/sign/…`): `/sign/[token]` password (if set) → AI summary (if any) → fill the fields on the PDF → name + signature (draw / type / upload) + consent → sealed copy + certificate downloads. Reopened signed link → done screen. `/open/[publicToken]` makes a person's own copy. Mobile first.
- **Signing flow (done, 2026-11-21; plan `docs/SIGNING-PLAN.md`):** one PDF + fields → many people → each fills and signs **their own copy**, sealed on its own (stamped PDF + sha256 + Ed25519 seal + Uzbek certificate); the sender gets every copy. Open link and password optional. Web: Hujjatlar → "Imzoga yuboriş" → field editor → people → send → links; detail page with downloads / add people / cancel. Sign app: password → summary → fill on the PDF → sign → download. Not yet: `pnpm seed:demo` still makes the old one-recipient DOCX request (no PDF/fields) — demo signing with a real send from the web app.
- **Sender signing API** (`apps/api/src/signature-requests/`): PDF → draft → fields + people (email / telegram / sms / link) → open link / password → send (returns every link) → add people → list (`box=sent|inbox`) → detail → cancel; copy + certificate downloads once sealed (sealing is phase 07). Spec: `test/signing-sender.spec.ts`.
- **Public signing API** (`apps/api/src/signing/`): a person with a link opens it (password → ticket in `x-sign-ticket`, 10 wrong → locked), reads the summary, gets the PDF, submits fields + signature once (server sets the date), polls status; open link → own copy. Downloads work once sealed (phase 07). Spec: `test/signing-public.spec.ts`.
- **Sealing** (`complete-submission` job): each signed copy → stamped PDF (Noto Sans) + sha256 + Ed25519 seal (`SEAL_KEYS`) + Uzbek certificate in storage; downloads unlock when both exist. Spec: `test/complete-submission.spec.ts`.
- `apps/web` signing (on the API): Hujjatlar → "Imzoga yuboriş" → PDF → field editor → people (email / telegram / sms / link, paste a list) → title, message, party, open link, password → send → every link to copy / share. Detail `/documents/sends/[id]`: who signed, downloads, add people, cancel. Hujjatlar lists (inbox, my sends, my files via `GET /documents`) are real data.
- Theme: light + dark in `apps/web` and `apps/sign` from one palette, `packages/theme/theme.css` (tokens only; Tailwind default colors disabled). Toggle via `ThemeToggle`, default follows the system. Buttons: shared `btn btn-primary|secondary|soft|ghost|danger` (+ `btn-sm|lg|icon`) classes from the same file.
- Demo shapes live in `apps/*/src/lib/demo.ts`; agree these with backend before wiring the API.

## In progress
- Law Phases 8, 9, 14 code done: hybrid search (keyword + Voyage), core laws from lex.uz with anchors, daily lex.uz sync (`pnpm sync:lexuz` / `SYNC_ENABLED`). Waiting for the MacBook run (Job E: ingest:hf → ingest:core → ingest:embed → eval). Next: Phase 10 tuning · AI team (zuhriddin). Plan: `docs/LOCAL-PLAN.md`.
- `apps/web` review screen · frontend team.
- Delivery: `send-signing-invite` logs one line per person (channel + contact); real Telegram / SMS / email delivery is "Later".
- Frontend UI (demo data) → wire to the API (`packages/contracts`, `pnpm seed:demo`) · frontend (Malika)

## Decisions
- Law search is Uzbek only for now: **Russian coverage (law Phase 15) is deferred** (2026-11-21). Cyrillic Uzbek queries are transliterated to Latin.
- Ports: web 3000, sign 3001, api 5000, Postgres 5434, Redis 6391.
- Users: one table; `agency_id` null = individual, else member of exactly one agency. Receivers who sign by link are not users. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- ORM: Drizzle (not Prisma), Postgres 18 (`uuidv7()`), camelCase in TS / snake_case in SQL. Image `pgvector/pgvector:pg18`; one database for users, law data and AI rows.
- One backend only (`apps/api`). lex-api was merged in on 2026-11-20; the AI review calls `SearchService` in-process, no HTTP hop. Env is validated with zod in `src/config/env.ts`.
- `/law/*` is `@Public()` for now (AI team curl testing); put it behind login later.
- Jobs: BullMQ, workers in the API process for now; every job idempotent (ids only in the payload, `jobId` makes enqueue idempotent too).
- Document bytes on local disk or Cloudflare R2 (`STORAGE_DRIVER=local|r2`, default local) behind `StorageService`; R2 bucket `lexdoc` is private, bytes always go through the API.
- Never modify an original: an accepted edit writes version + 1 with a new sha256, and only the latest version can be sent.
- The server decides citations: an `articleId` the model did not receive becomes `citation: null`, and the finding keeps its text.
- Snapshot, don't reference: `signature_requests.document_hash` + `summary_hash`, and `recipient_summaries.summary_hash` per signer.
- Plan limits checked at enqueue: individual per user, agency pooled (`ai_usage.scope_key`), 402 with `REVIEW_LIMIT_REACHED`.
- `AI_PROMPT_VERSION` is part of a review's idempotency key, so old reviews keep the prompt they ran under.
- Colors: only the `@lex/theme` tokens, each with light + dark values; add new colors there (both modes), never hard-coded hex / Tailwind palette in components (exception: logo + avatar gradient).
- UI language: Uzbek in the **new Latin alphabet** (ş ç ğ ö, ʼ). Login form / SessionGate texts (auth team files) are still English.
- Users can upload a document on the home screen (`/`, small "Hujjat yuklaş" pill under the question box; PDF/DOCX/TXT, 20 MB) — for now it only opens the demo `/review`, not yet wired to `POST /documents`. "Hujjatlar" page: Imzolaş (filters Imzolaşim kerak / Javob kutilmoqda / Imzolangan, in + out) and Mening hujjatlarim (my files + upload, demo data); user reviews with AI, then signs or requests changes.
- Scope: besides contract review, users can ask general legal questions ("what happens / where do I go"). Answer shape: summary · consequences+cites · steps · contacts · optional template.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
- Signing model (2026-11-21): a send = one PDF + one field layout to many people; every person fills and signs **their own copy**, sealed on its own; the sender gets all copies. No routing order / cc. Open link and password are optional, off by default. Only PDF can be sent (users convert Word themselves). Channels are stored and shown, not delivered yet. Sender pre-signing → Later.
