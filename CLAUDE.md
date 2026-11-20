# CLAUDE.md

AI legal review + e-signature SaaS for Uzbek contracts. See `ROADMAP.md` for the product plan.

## ⚠️ Important rule: this is a hackathon

The goal is a **working MVP**. Keep everything simple.

- **No RLS and no row-level / tenant isolation at all.** Do not add `ENABLE`/`FORCE ROW LEVEL SECURITY`, `tenant_isolation` policies, `withTenant` wrappers or `rls.spec.ts` tests.
- **Store users and agencies as plain tables.** A simple `userId` / `agencyId` column is enough.
- **No detailed or enterprise-grade layers for now.** Build the working end-to-end flow first; hardening comes after the hackathon.
- **No need to test on every change.** Don't run builds, lint, tests or start the apps after each small edit. Check only when it matters (before a commit/demo, or when something looks broken), or when asked.
- If something is "nice to have", put it in the roadmap's "Later — only if time allows" section instead of building it.

## Ports

| App | Port | URL |
|---|---|---|
| Frontend `apps/web` (Next.js, sender dashboard) | **3000** | http://localhost:3000 |
| Signing app `apps/sign` (Next.js, public users, no login) | **3001** | http://localhost:3001 |
| Backend `apps/api` (NestJS) | **5000** | http://localhost:5000 |
| Law service `apps/lex-api` (NestJS, called only by `apps/api`) | **5001** | http://localhost:5001 |
| Postgres (Docker, `lex-postgres`) | **5434** | `postgres://lex:lex@localhost:5434/lex` |
| Law Postgres + pgvector (Docker, `apps/lex-api/docker-compose.yml`) | **5433** | `postgres://lex:lex@localhost:5433/lex` |

- Backend: `PORT` env (default 5000); CORS allows `WEB_ORIGIN` (default `http://localhost:3000`).
- Frontend and signing app: `API_URL` env (default `http://localhost:5000`).
- Signing links look like `http://localhost:3001/sign/<token>`. Run it with `pnpm dev:sign`.
- Don't change these ports without telling the team and updating `memory/`.

## Database

- Postgres runs in Docker (`docker-compose.yml`, image `postgres:18-alpine`, host port **5434** because 5432/5433 are often taken locally).
- ORM: **Drizzle** in `apps/api`. Schema: `apps/api/src/db/schema/` (one file per table, exported from `index.ts`); migrations: `apps/api/drizzle/`; config: `apps/api/drizzle.config.ts`.
- Inject the db in Nest with `@Inject(DB) private readonly db: Db` (from `src/db/db.module.ts`, global module).
- Columns are camelCase in TS and snake_case in Postgres (`casing: 'snake_case'`). Ids are `uuidv7()`.
- **Users:** one `users` table. `agency_id` null = individual; set = member of that one agency (`agency_role` owner/admin/member). Receivers who sign by link are not users.
- Change a table → edit the schema file → `pnpm db:generate` → `pnpm db:migrate` → commit the migration and log it in `memory/`.
- Commands: `pnpm db:up` / `pnpm db:down` / `pnpm db:studio`.

## Team memory: `memory/` folder

The team is working fast on this project at the same time, so everyone (people and Claude) needs to know what is changing. The `memory/` folder in the repo root is the shared log.

- **Read `memory/` before starting work**, so you know the current state and recent changes.
- **When you change something, update `memory/` in the same change.** This covers schema/tables, API routes, env vars, jobs, the flow, new packages, and decisions or scope changes.
- `memory/CHANGELOG.md`: add an entry at the top: date, who/which area, what changed, and anything others must do (run migration, new env var, etc.).
- `memory/STATE.md`: keep it current: what works now, what is in progress, and who is on what. Edit it in place; don't only append.
- Keep entries short (1–3 lines). Commit `memory/` together with the code it describes.
