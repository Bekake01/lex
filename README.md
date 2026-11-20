# LexHackathon

AI legal review + e-signature for Uzbek contracts, built as a hackathon MVP.

A sender uploads a contract and **AI checks it against Uzbek legislation** (lex.uz), citing real articles. It suggests fixes on request, and then the contract is sent for signature. The receiver opens a **signing link**. They can open it as many times as they like, but they can sign only once, and the link closes after signing. Before signing, they read a plain-language **summary of the contract and of their own obligations**. Both parties then get a **sealed, verifiable signed document**.

## Apps

| App            | What                                                | Port |
| -------------- | --------------------------------------------------- | ---- |
| `apps/web`     | Next.js sender dashboard (upload, AI review, send)  | 3000 |
| `apps/sign`    | Next.js public signing app for receivers (no login) | 3001 |
| `apps/api`     | NestJS backend + AI jobs, Drizzle ORM               | 5000 |
| Postgres       | Docker (`docker-compose.yml`)                       | 5434 |
| Redis          | Docker, BullMQ jobs                                 | 6379 |

| Package              | What                                                          |
| -------------------- | ------------------------------------------------------------- |
| `packages/contracts` | Zod schemas + mock responses — the boundary with the frontend |
| `packages/crypto`    | Canonical hashing and the certificate lines                   |

Signing links look like `http://localhost:3001/sign/<token>`.

## Getting started

Requires Node 24+, pnpm and Docker.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/sign/.env.example apps/sign/.env.local
cp apps/api/.env.example apps/api/.env
pnpm services:up      # Postgres (5434) + Redis (6379) in Docker
pnpm db:migrate       # apply Drizzle migrations
pnpm dev              # all apps
# or: pnpm dev:api / pnpm dev:web / pnpm dev:sign
```

Fill `OPENAI_API_KEY` in `apps/api/.env` for the AI review. Then:

```bash
pnpm seed:demo        # a sender with a finished review and a signing link
pnpm eval:review      # review quality (citation accuracy, issue precision)
```

The AI API the frontend builds against is [`packages/contracts/src/ai.ts`](packages/contracts/src/ai.ts),
with sample responses in [`packages/contracts/mocks/`](packages/contracts/mocks) and
the route list in [`apps/api/README.md`](apps/api/README.md).

## Hackathon rules

- **Working MVP first.** Keep it simple, with no enterprise-grade layers.
- **No RLS or tenant isolation.** Users and agencies are plain tables.
- **No need to test on every change.** Check before a commit or demo.
- Nice-to-haves go to "Later — only if time allows" in the roadmap.

## Team docs

- [`ROADMAP.md`](ROADMAP.md): product plan, flow, architecture, phases
- [`CLAUDE.md`](CLAUDE.md): rules for working on the repo (people and Claude)
- [`memory/`](memory/): shared log. Read it before you start, and update it when you change something ([`CHANGELOG.md`](memory/CHANGELOG.md), [`STATE.md`](memory/STATE.md))
