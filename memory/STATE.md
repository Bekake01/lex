# Current state

Edit in place to keep this current.

## Works now
- Monorepo skeleton: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), pnpm + turbo.
- Database: Postgres (Docker, 5434) + Drizzle. Tables: `agencies`, `users`, `sessions`, `email_codes` (schema only; login / forgot password / Resend not implemented yet). Test endpoints `GET /users`, `POST /users` in `apps/api`.
- `apps/sign`: `/sign/[token]` page exists as a placeholder (shows the token; no API call yet).
- `apps/lex-api` (NestJS, 5001): law database service for the AI review. Done: setup + API key guard, Postgres/pgvector schema + migrations, Uzbek text utils, Hugging Face law import (54k articles), keyword search (`POST /search`, `/articles/batch`, `/meta`). Not yet: embeddings, document extraction.

## In progress
- `apps/lex-api` Phase 5+ (chunking, then `/search` for `apps/api`) · AI team

## Decisions
- Ports: frontend 3000, signing app 3001, backend 5000, law service `apps/lex-api` 5001, Postgres 5434 (lex-api's own pgvector Postgres: 5433).
- Users: one table; `agency_id` null = individual, else member of exactly one agency. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- ORM: Drizzle (not Prisma). Postgres image `postgres:18-alpine`; pgvector to be added when law search needs it (`apps/lex-api` already runs its own pgvector Postgres on 5433, separate from this one).
- `apps/lex-api` is server-to-server only: `apps/api` calls it with the `x-lex-api-key` header; browsers never do. User login stays in `apps/api`.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
