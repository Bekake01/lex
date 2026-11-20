# Current state

Edit in place to keep this current.

## Works now
- Monorepo skeleton: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), pnpm + turbo.
- Database: Postgres (Docker, 5434) + Drizzle. Tables: `agencies`, `users`, `sessions`, `email_codes` (forgot password / Resend not implemented yet).
- Login (`apps/api/src/auth/`, `apps/web` `/login`): login / refresh / logout + `GET /me`, global access-token guard (`@Public()` to opt out). Team accounts via `pnpm db:seed` (Bekzod, Malika, Zuxriddin, Quvomiddin; password = email part before `@`). No sign-up page, no forgot password yet.
- `apps/sign`: `/sign/[token]` page exists as a placeholder (shows the token; no API call yet).
- Law (in `apps/api/src/law/`, merged from lex-api): `law_acts` / `law_articles` / `law_sync_runs` with pgvector, Uzbek text utils, Hugging Face import (`pnpm ingest:hf`, 54k articles), keyword search (`POST /law/search`, `/law/articles/batch`, `GET /law/meta`; `SearchService` exported from `LawModule` for the AI review). `GET /health` reports db + law index date. Long articles/acts split into parts (≤ ~1,600 tokens, `parent_id`). Search eval: 102 queries, keyword R@10 91.3% on codes + laws (`docs/decisions/embeddings.md`). Not yet: embeddings, document extraction.

## In progress
- Law Phase 7: embedding choice (needs `VOYAGE_API_KEY` + a bge-m3 server), then Phase 8 hybrid search, in `apps/api/src/law/` · AI team (zuhriddin)

## Decisions
- Ports: frontend 3000, signing app 3001, backend 5000, Postgres 5434.
- Users: one table; `agency_id` null = individual, else member of exactly one agency. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- ORM: Drizzle (not Prisma). Postgres image `pgvector/pgvector:pg18`; one database for users and law data.
- One backend only (`apps/api`). lex-api was merged in on 2026-11-20; the AI review calls `SearchService` in-process, no HTTP hop. Env is validated with zod in `src/config/env.ts`.
- `/law/*` is `@Public()` for now (AI team curl testing); put it behind login later.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
