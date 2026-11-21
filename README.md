# Cralex

AI legal review + e-signature for Uzbek contracts.

A sender uploads a contract and **AI checks it against Uzbek legislation** (lex.uz), citing real articles. It suggests fixes on request, and then the contract is sent for signature. The receiver opens a **signing link**. They can open it as many times as they like, but they can sign only once, and the link closes after signing. Before signing, they read a plain-language **summary of the contract and of their own obligations**. Both parties then get a **sealed, verifiable signed document**.

## Apps

| App            | What                                                | Port |
| -------------- | --------------------------------------------------- | ---- |
| `apps/web`     | Next.js sender dashboard (upload, AI review, send)  | 3000 |
| `apps/sign`    | Next.js public signing app for receivers (no login) | 3001 |
| `apps/api`     | NestJS backend + AI jobs, Drizzle ORM               | 5000 |
| Postgres       | Docker (`docker-compose.yml`)                       | 5434 |
| Redis          | Docker, BullMQ jobs                                 | 6391 |

| Package              | What                                                          |
| -------------------- | ------------------------------------------------------------- |
| `packages/contracts` | Zod schemas + mock responses — the boundary with the frontend |
| `packages/crypto`    | Canonical hashing and the certificate lines                   |

Signing links look like `http://localhost:3001/sign/<token>`; a send's open link is `http://localhost:3001/open/<publicToken>`.

## Getting started

Requires Node 24+, pnpm and Docker.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/sign/.env.example apps/sign/.env.local
cp apps/api/.env.example apps/api/.env
pnpm services:up      # Postgres (5434) + Redis (6391) in Docker
pnpm db:migrate       # apply Drizzle migrations
pnpm dev              # all apps
# or: pnpm dev:api / pnpm dev:web / pnpm dev:sign
```

In `apps/api/.env`:

- `OPENAI_API_KEY`: for the AI review and the signer summary.
- `SEAL_KEYS`: the seal key ring for signed copies. Run `pnpm --filter api seal:keygen` and paste the line it prints.
  Without it a signed copy is never sealed (no download). Never delete a key once copies are sealed with it.
- `SIGN_TICKET_SECRET`: signs password tickets (optional in dev, required in production).
- `STORAGE_DRIVER=local|r2` (default `local`); for `r2` also `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` (`S3_REGION` defaults to `auto`).
- `SIGN_APP_URL` (default `http://localhost:3001`, production `https://crasoftinc.com`): the host signing links point to.
- `RESEND_API_KEY` (optional): sends signing invites by email through Resend; without it they are only logged. `MAIL_FROM` (default `Cralex <no-reply@thetfone.com>`) is the one sender address.

Then:

```bash
pnpm seed:demo        # a sender with a finished review (login demo@lex.local / demo)
pnpm eval:review      # review quality (citation accuracy, issue precision)
```

The AI API the frontend builds against is [`packages/contracts/src/ai.ts`](packages/contracts/src/ai.ts),
with sample responses in [`packages/contracts/mocks/`](packages/contracts/mocks) and
the route list in [`apps/api/README.md`](apps/api/README.md).
