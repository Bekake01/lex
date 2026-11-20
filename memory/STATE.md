# Current state

Edit in place to keep this current.

## Works now
- Monorepo skeleton: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), pnpm + turbo.
- Database: Postgres (Docker, 5434) + Drizzle. Tables: `agencies`, `users`, `sessions`, `email_codes` (schema only; login / forgot password / Resend not implemented yet). Test endpoints `GET /users`, `POST /users` in `apps/api`.
- `apps/sign`: `/sign/[token]` page exists as a placeholder (shows the token; no API call yet).
- Law (in `apps/api/src/law/`, merged from lex-api): `law_acts` / `law_articles` / `law_sync_runs` with pgvector, Uzbek text utils, Hugging Face import (`pnpm ingest:hf`, 54k articles), keyword search (`POST /law/search`, `/law/articles/batch`, `GET /law/meta`; `SearchService` exported from `LawModule` for the AI review). `GET /health` reports db + law index date. Not yet: chunking, embeddings, document extraction.

## In progress
- Law Phase 5+ (chunking, embeddings) in `apps/api/src/law/` · AI team (zuhriddin)

## Decisions
- Ports: frontend 3000, signing app 3001, backend 5000, Postgres 5434.
- Users: one table; `agency_id` null = individual, else member of exactly one agency. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- ORM: Drizzle (not Prisma). Postgres image `pgvector/pgvector:pg18`; one database for users and law data.
- One backend only (`apps/api`). lex-api was merged in on 2026-11-20; the AI review calls `SearchService` in-process, no HTTP hop. Env is validated with zod in `src/config/env.ts`.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
