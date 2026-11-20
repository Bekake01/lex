# lex-api

Private NestJS service that knows Uzbek law and processes contract files. The main backend (adss-saas `apps/api`) calls it server-to-server; browsers never do.

- Hybrid law search over lex.uz-sourced legislation (Postgres + pgvector)
- Citation lookup for AI review results
- PDF/DOCX text extraction, clause splitting, and DOCX edits
- Daily lex.uz sync

Build plan and phases: [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md). HTTP contract: [src/contract.ts](src/contract.ts).

## Rules

- Every route except `GET /health` needs the `x-lex-api-key` header.
- User documents are processed in memory only; never stored, never logged.
- lex.uz is contacted only by ingest commands and the sync job, never during a request.

## Setup

Requires Node 24, pnpm and Docker.

```bash
pnpm install                   # from the monorepo root
cp .env.example .env          # then set LEX_API_KEY (generator in the file)
docker compose up -d          # Postgres + pgvector on localhost:5433
pnpm db:migrate               # creates the vector extension and law_* tables
pnpm start:dev                # http://localhost:5001
```

```bash
curl localhost:5001/health    # → {"ok":true,"db":true,"indexVersionDate":null}
```

`db: false` means Postgres is unreachable. `indexVersionDate` is the newest law edition loaded (null until the Phase 4 import).

## Database

Schema: [src/db/schema.ts](src/db/schema.ts). After changing it, run `pnpm db:generate` and commit the new file in `drizzle/`. Never edit an applied migration.

Tests don't need Docker: they run the real migrations on PGlite (in-process Postgres with pgvector).

## Loading the law data

```bash
mkdir -p data/hf
curl -L -o data/hf/articles.parquet \
  https://huggingface.co/datasets/sukhrobnurali/uzbek-legal-corpus/resolve/main/articles/train-00000-of-00001.parquet
pnpm ingest:hf                # ~54k articles; safe to re-run (unchanged rows aren't written)
```

To test the import on the full file without Postgres (several minutes):
`HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/hf-import.full.spec.ts`

The app validates its environment at boot and refuses to start on a bad one, naming the offending keys.

## Checks

```bash
pnpm build && pnpm lint && pnpm test && pnpm test:e2e
```
