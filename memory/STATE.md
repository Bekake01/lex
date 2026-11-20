# Current state

Edit in place to keep this current.

## Works now
- Monorepo skeleton: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), pnpm + turbo.
- Database: Postgres (Docker, 5434) + Drizzle. Tables: `agencies`, `users`, `sessions`, `email_codes` (schema only; login / forgot password / Resend not implemented yet). Test endpoints `GET /users`, `POST /users` in `apps/api`.
- `apps/sign`: `/sign/[token]` page exists as a placeholder (shows the token; no API call yet).

## In progress
- _(add: what · who)_

## Decisions
- Users: one table; `agency_id` null = individual, else member of exactly one agency. No email verification for the hackathon. Login = tms-style sessions (JWT access + rotating refresh). Forgot password = 6-digit code via Resend (`email_codes`).
- Ports: frontend 3000, signing app 3001, backend 5000, Postgres 5434.
- ORM: Drizzle (not Prisma). Postgres image `postgres:18-alpine`; pgvector to be added when law search needs it.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
