# Changelog

Newest first. Format: `YYYY-MM-DD · area · what changed · action needed (if any)`

- 2026-11-20 · lex-api · New app `apps/lex-api` (law search service for the AI review), port **5001**, run with `pnpm dev:lex`. Needs Postgres + pgvector (`docker compose up -d` in that folder) and its own `.env` from `.env.example`. Run `pnpm install` at the root. Not needed to run web/sign/api.
- 2026-11-20 · docs · Rule: no need to test/build/lint after every change; check before commit/demo or when asked.
- 2026-11-20 · sign · New Next.js app `apps/sign` for public users who sign (no login), port **3001**. Page `/sign/[token]` is a placeholder for now. Run `pnpm install`, then `pnpm dev:sign`. Copy `apps/sign/.env.example` to `.env.local`.
- 2026-11-20 · web, api · Ports: frontend `apps/web` → **3000**, backend `apps/api` → **5000**. Update your `apps/web/.env.local` to `API_URL=http://localhost:5000`.
- 2026-11-20 · docs · Added `CLAUDE.md` with the hackathon rule (no RLS / tenant isolation, plain users & agencies tables, MVP first) and this `memory/` folder.
- 2026-11-20 · roadmap · Signing link can be opened many times but signed only once; it closes after signing. Receiver sync to existing accounts moved to "Later — only if time allows". RLS removed from the plan.
