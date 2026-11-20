# Current state

Edit in place to keep this current.

## Works now
- Monorepo skeleton: `apps/api` (NestJS, 5000), `apps/web` (Next.js sender dashboard, 3000), `apps/sign` (Next.js public signing app, 3001), pnpm + turbo.
- `apps/sign`: `/sign/[token]` page exists as a placeholder (shows the token; no API call yet).

## In progress
- _(add: what · who)_

## Decisions
- Ports: frontend 3000, signing app 3001, backend 5000.
- Hackathon MVP: no RLS, no tenant isolation, plain users / agencies tables (see `CLAUDE.md`).
- Signing link: open many times, sign once, closes after signing.
