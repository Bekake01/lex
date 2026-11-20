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
| Postgres (Docker, `lex-postgres`) | **5434** | `postgres://lex:lex@localhost:5434/lex` |
| Redis (Docker, `lex-redis`, BullMQ jobs) | **6391** | `redis://localhost:6391` |

- Backend: `PORT` env (default 5000); CORS allows `WEB_ORIGIN` (default `http://localhost:3000`).
- Frontend and signing app: `API_URL` env (default `http://localhost:5000`).
- Signing links look like `http://localhost:3001/sign/<token>`. Run it with `pnpm dev:sign`.
- Don't change these ports without telling the team and updating `memory/`.

## Database

- Postgres and Redis run in Docker (`docker-compose.yml`): `pnpm services:up` starts both (`pnpm db:up` / `pnpm redis:up` for one). Postgres is `pgvector/pgvector:pg18` (Postgres 18 + pgvector) on host port **5434**, because 5432/5433 are often taken locally.
- ORM: **Drizzle** in `apps/api`. Schema: `apps/api/src/db/schema/` (one file per table, exported from `index.ts`); migrations: `apps/api/drizzle/`; config: `apps/api/drizzle.config.ts`.
- Inject the db in Nest with `@Inject(DB) private readonly db: Db` (from `src/db/db.module.ts`, global module).
- Columns are camelCase in TS and snake_case in Postgres (`casing: 'snake_case'`). Ids are `uuidv7()`.
- **Users:** one `users` table. `agency_id` null = individual; set = member of that one agency (`agency_role` owner/admin/member). Receivers who sign by link are not users.
- Change a table → edit the schema file → `pnpm db:generate` → `pnpm db:migrate` → commit the migration and log it in `memory/`.
- Commands: `pnpm db:up` / `pnpm db:down` / `pnpm db:studio`.

## AI pipeline (`apps/api/src/ai-review/`)

- AI provider is **OpenAI** (Responses API, `openai` SDK). All model calls go through `ai.service.ts` (errors in `ai-errors.ts`): one client, structured output via Zod → strict JSON Schema (`json-schema.ts`) with every answer re-validated by Zod, `AI_MODEL` (default `gpt-5`, review + revise) and `AI_MODEL_LIGHT` (default `gpt-5-mini`, classify + summaries) + `AI_EFFORT`, prompt caching on the stable instructions (`prompt_cache_key`). Never call the SDK anywhere else.
- Prompts live in `prompts.ts`. Contract text is **data, never instructions**; a finding with no supporting retrieved article gets `citation: null` instead of a guess.
- All AI work runs as a BullMQ job (`analyze-document`, `revise-document`, `summarize-for-recipients`): a POST returns an id, the frontend polls the GET. Jobs take ids only and must stay idempotent.
- The signing path never calls the model: `GET /sign/:token/summary` reads `recipient_summaries`, which the send-time job wrote.
- Law search comes from the in-process `LawModule` (`law-search/db-law-search.service.ts`), with fixtures as a fallback when the law tables are empty — `LAW_SEARCH_MODE=auto|db|fake`. Document extraction is a text/PDF stand-in for now.
- `packages/contracts/src/ai.ts` is the only thing the frontend builds against; changes to it are **add-only**. `packages/contracts/mocks/` holds a mock response per route.
- Bump `AI_PROMPT_VERSION` whenever a prompt changes, and re-run `pnpm eval:review`.

## Team memory: `memory/` folder

The team is working fast on this project at the same time, so everyone (people and Claude) needs to know what is changing. The `memory/` folder in the repo root is the shared log.

- **Read `memory/` before starting work**, so you know the current state and recent changes.
- **When you change something, update `memory/` in the same change.** This covers schema/tables, API routes, env vars, jobs, the flow, new packages, and decisions or scope changes.
- `memory/CHANGELOG.md`: add an entry at the top: date, who/which area, what changed, and anything others must do (run migration, new env var, etc.).
- `memory/STATE.md`: keep it current: what works now, what is in progress, and who is on what. Edit it in place; don't only append.
- Keep entries short (1–3 lines). Commit `memory/` together with the code it describes.
