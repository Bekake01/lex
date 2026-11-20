# lex-api — Build Plan (Developer A)

> **2026-11-20: lex-api was merged into `apps/api`.** Code is now in `apps/api/src/law/` (search, ingest, text), the schema in `apps/api/src/db/schema/law.ts`, one Postgres (5434, pgvector). No `x-lex-api-key`, no port 5001: routes are `/law/search`, `/law/articles/batch`, `/law/meta`, and `/health`. Read the plan below for the phases; paths and ports in it are historical.

> Builds the **Developer A** track (`../DEV-A-law-data.md`) as this standalone NestJS service.
> Each phase is small, ends in something that **builds, runs and is tested**, and can be merged on its own.

---

## 1. What lex-api is

A **private service** that knows Uzbek law and processes contract files. The main backend (adss-saas `apps/api`, Developer B) calls it over HTTP. Browsers never call it.

```
adss-saas apps/api (Developer B)
        │  HTTPS + x-lex-api-key
        ▼
┌──────────────── lex-api ────────────────┐
│ /search            hybrid law search     │
│ /articles/batch    citation check        │
│ /meta              law version date      │
│ /documents/extract PDF/DOCX → text+clauses│
│ /documents/apply-edits  DOCX edits       │
│ sync job           lex.uz RSS (daily)    │
└──────────────┬──────────────────────────┘
               ▼
     Postgres + pgvector (own database)
```

**Rules**
- **Never stores user documents.** `/documents/*` works in memory; file bytes and text are never written to the DB or logs.
- **No tenant data.** Law data is global; lex-api knows nothing about users or tenants.
- **Not public.** Every route except `/health` requires the `x-lex-api-key` header (timing-safe compare). Remove the `enableCors` line in `src/main.ts`, since no browser should call this service.
- **lex.uz is only contacted by the import/sync jobs**, never during a request.

---

## 2. Stack (on top of the existing starter)

Already here: NestJS 12, ESM (`"type": "module"`, `.js` import specifiers), TypeScript 6, vitest, oxlint, prettier, pnpm.

| Need | Choice | Why |
|---|---|---|
| Database | Postgres 17 + `pgvector` | One store for text search and vectors |
| DB access | **Drizzle ORM** + `drizzle-kit` | Native `vector` column and distance helpers; Prisma would need raw SQL for every vector query |
| Config | `zod` env schema, validated at boot | Fail fast, same pattern as adss-saas |
| Parquet reading | `@duckdb/node-api` | Reads Parquet directly, fast, handles 320 MB easily |
| Embeddings | Voyage (`voyage-3.5`, 1024 dims) **or** `bge-m3` (self-hosted, 1024 dims) | Decided in Phase 7 by measurement; both are 1024-d, so the schema doesn't change |
| PDF text | `unpdf` (pdf.js) | Text layer + page count |
| DOCX text | `mammoth` | Clean text from Word |
| DOCX editing | `jszip` + XML handling | Edit `word/document.xml` while keeping formatting |
| HTML parsing (lex.uz) | `cheerio` | Core act import + sync |
| Scheduling | `@nestjs/schedule` + Postgres advisory lock | One daily job; no Redis needed |
| Logging | `nestjs-pino` with redaction | Structured logs, no document text |

---

## 3. HTTP API (the contract with Developer B)

Freeze this in Phase 1. Later changes are add-only.

| Method + path | Body | Response |
|---|---|---|
| `GET /health` | — | `{ ok, db, indexVersionDate }` (no auth) |
| `POST /search` | `{ queries: string[], docType?, inForceOnly? = true, limit? = 30 }` | `{ hits: LawArticleHit[] }` |
| `POST /articles/batch` | `{ ids: string[] }` | `{ articles: LawArticleHit[] }` |
| `GET /meta` | — | `{ indexVersionDate, acts, articles, coreActs, lastSyncAt }` |
| `POST /documents/extract` | multipart `file` (PDF/DOCX, ≤ 20 MB) | `ExtractedDoc` |
| `POST /documents/apply-edits` | multipart `file` (DOCX) + `edits` JSON | DOCX bytes, or 422 `{ error: 'EDIT_NOT_FOUND', index }` |

```ts
type DocType = 'rental'|'employment'|'sale'|'services'|'nda'|'other';
interface LawArticleHit {
  articleId: string; actTitle: string;
  actType: 'constitution'|'code'|'law'|'decree'|'resolution'|'order'|'other';
  articleNumber: string|null; text: string; sourceUrl: string;
  versionDate: string; core: boolean; score: number;
}
interface ExtractedDoc {
  text: string; language: 'uz-latn'|'uz-cyrl'|'ru'|'en'|'mixed';
  pageCount?: number; scanned: boolean; clauses: Clause[];
}
interface Clause { ref: string; heading?: string; text: string; start: number; end: number }
```

> Note for Developer B: the earlier plan had `doc-processing` as a package to import. With lex-api as a separate repo, B calls these HTTP endpoints instead; the shapes are unchanged.

---

## 4. Phases

Each phase lists **Build**, **Files**, and **Done when** (the check that must pass before merging). Branch per phase: `a/p01-setup`, `a/p02-schema`, …

### Phase 1 — Project setup (1 day)
**Build**
- `src/config/env.ts`: zod schema (`PORT`, `DATABASE_URL`, `LEX_API_KEY`, `EMBEDDING_PROVIDER`, `VOYAGE_API_KEY?`, `EMBEDDING_URL?`, `SYNC_ENABLED`); the app refuses to start on a bad env
- `docker-compose.yml`: `pgvector/pgvector:pg17`
- `ApiKeyGuard` as a global guard; `@Public()` decorator for `/health`
- `GET /health`
- `nestjs-pino` logging with redaction (`req.headers["x-lex-api-key"]`, `body`)
- Remove `enableCors` from `main.ts`; `.env.example` with placeholders only
- Write the §3 contract as `src/contract.ts` (types only) and share it with B
- Replace the starter README with a short project README

**Done when:** `pnpm build && pnpm lint && pnpm test` green; `docker compose up -d && pnpm start:dev`; `curl localhost:5001/health` → 200; any protected route without the key → 401 (unknown paths return Express's 404 before guards run).

### Phase 2 — Database schema (1 day)
**Build**
- `src/db/schema.ts` (Drizzle):
  - `law_acts`: `doc_id` (pk), `act_group_id`, `title`, `act_type`, `doc_number`, `doc_date`, `version_date`, `status` (`in_force`|`repealed`|`unknown`), `status_checked` (bool), `core` (bool), `language`, `source_url`, `source` (`hf`|`lexuz`)
  - `law_articles`: `id` (pk), `doc_id` (fk), `article_number`, `part`, `chapter`, `title`, `text`, `text_norm`, `chunk_index`, `n_tokens`, `quality_flag`, `language`, `tsv` (generated `tsvector`), `embedding vector(1024)`
  - `law_sync_runs`: `id`, `started_at`, `finished_at`, `status`, `acts_checked`, `acts_updated`, `error`
- Indexes: GIN on `tsv`, HNSW on `embedding` (cosine), btree on `doc_id`, `law_acts(act_type, status, core)`
- `drizzle-kit` migration + `CREATE EXTENSION vector`
- `DbModule` providing the Drizzle client

**Done when:** `pnpm db:migrate` on an empty database succeeds; an integration test inserts and reads one act + article; `/health` reports `db: true`.

### Phase 3 — Uzbek text utilities (1 day)
**Build** `src/text/` (pure functions, no NestJS):
- `normalizeUz()`: `oʻ o' o‘ o’ o`` → `oʻ`; `gʻ` likewise; separator `ʼ` unified; whitespace collapsed; lowercase variant for search
- `cyrillicToLatinUz()`: full Uzbek Cyrillic → Latin table (ў→oʻ, ғ→gʻ, ш→sh, ч→ch, ё→yo, ц rules, е at word start → ye…)
- `detectScript()`: share of Cyrillic vs Latin letters
- `countTokens()`: approximate count for chunk sizes

**Done when:** ≥ 30 unit tests from real legal text pass, including mixed apostrophes and the Cyrillic edge cases.

### Phase 4 — Hugging Face import (2 days)
**Build** `src/ingest/hf-import.command.ts`, run with `pnpm ingest:hf [path]` (default `data/hf/articles.parquet`):
- Download once: `articles/train-00000-of-00001.parquet` (163 MB) into `data/hf/` (git-ignored). The `documents` file isn't needed: every article row already carries its act's metadata, and flat acts come as one `-full` row
- The dataset reuses 341 ids across 1,628 rows (amending laws' quoted articles); all rows are kept, repeats get `-d2`, `-d3`… in file order
- Read with DuckDB → upsert `law_acts` + `law_articles` in batches of 1,000 (idempotent: re-running changes nothing)
- Map `status` → `in_force`/`repealed`/`unknown`, `status_checked = false`; skip `quality_flag = 'too-short'`; keep `parse-uncertain` with its flag
- Fill `text_norm` with `normalizeUz()`
- Print a report: acts by type, articles, skipped rows, time taken

**Done when:** import finishes; counts match the dataset card (about 24k acts, about 54k articles, minus skipped rows); a second run inserts 0 new rows.

### Phase 5 — Chunking (1 day)
**Build** `src/ingest/chunk.ts`:
- Articles over about 1,500 tokens → split into parts of ≤ 1,200 (`{id}-p1`, `-p2`…); every part keeps the article number, title and chapter, and its search text starts with the title
- Flat acts (`{docId}-full`, no article split) → chunks of about 400–800 tokens
- The dataset has no line breaks (paragraphs are collapsed), so cuts go at sentence ends, then `;`/`:`, then spaces
- Parts link to the original via `law_articles.parent_id`; `chunk_index` 0 = whole row, 1… = part number
- `pnpm ingest:hf` splits while importing and removes leftover rows when an article grows or shrinks; `pnpm ingest:chunk` splits rows already in the database

**Done when:** no row in `law_articles` exceeds about 1,600 tokens; unit tests on chunk boundaries; an article's parts join back into the original text.

### Phase 6 — Keyword search + `/search` v1 (2 days) → early hand-off to B
**Build**
- `tsv` uses the `simple` configuration over `text_norm` (Postgres has no Uzbek stemmer); add `pg_trgm` for spelling variants on titles
- `SearchService.search()`: run each query, merge results, filter `inForceOnly` (`status <> 'repealed'`), sort by rank, `limit`
- `POST /search`, `POST /articles/batch`, `GET /meta` (§3 shapes, validated with zod)

**Done when:** e2e tests for all three routes; a query like "ijara shartnomasini bekor qilish" returns Civil Code rental articles in the top 10; **B can integrate now (Sync 1, keyword only)**.

### Phase 7 — Search eval + embedding choice (2 days)
**Build**
- `eval/search/queries.jsonl`: 100 queries (rental, employment, sale, services, NDA, consumer rights) with expected `articleId`s; write them with someone who knows the law
- `pnpm eval:search`: prints recall@5, recall@10, MRR
- Embed a sample (all articles of about 30 key acts) with **Voyage** and **bge-m3**; compare recall on the same queries
- Write the decision and numbers in `docs/decisions/embeddings.md`

**Done when:** baseline keyword recall@10 recorded; embedding model chosen with numbers.

**Status (2026-11-20):** 102 queries in `apps/api/eval/search/queries.jsonl`; `pnpm eval:search`; keyword baseline on codes + laws: R@10 91.3%, MRR 0.765. **Done 2026-11-21: Voyage `voyage-3.5` chosen** (vector-only R@10 93.5% vs keyword 93.1% on the sample; they miss different queries, so Phase 8 goes hybrid). Numbers and next steps: `docs/decisions/embeddings.md`.

### Phase 8 — Embeddings + hybrid search (2 days)
**Build**
- `EmbeddingService` (one interface, two providers): batching, retry with backoff, rate limit
- `pnpm ingest:embed`: embeds rows where `embedding IS NULL`, resumable, progress log
- Hybrid search: keyword top 50 + vector top 50 → **reciprocal rank fusion** → `limit`
- Query embedding cache (in-memory LRU)

**Done when:** all rows embedded; `eval:search` recall@10 is clearly above the keyword baseline (target ≥ 0.75 at this point); `/search` p95 < 300 ms for 5 queries.

**Status (2026-11-21): code done, measurement pending.** `EmbeddingService` (`src/law/embeddings/embedding.service.ts`: Voyage from env, query cache of 2,000, Cyrillic queries embedded in Latin, keyword-only fallback when the provider fails or is not configured); hybrid `SearchService.search` (keyword + vector top 50 per query, RRF); `pnpm ingest:embed [--limit N]` (resumable, token-budget batches); `pnpm eval:search [--keyword-only] --out`; `pnpm ingest:hf --types …` for a small subset. Tests use a fake provider (`test/law/hybrid-search.spec.ts`). The full embed + measurement runs on the MacBook: Job E in `docs/heavy-jobs-mac.md`.

### Phase 9 — Core acts from lex.uz (3 days)
**Build**
- `data/core-acts.yaml`: about 50 acts (Civil Code, Labor Code 2023, Tax, Housing, Family codes; laws on consumer rights, personal data, the rental market, contract-related laws…) with lex.uz ids and the `docType`s each one anchors
- `src/lexuz/fetcher.ts`: polite client (≥ 2 s between requests, user agent naming the service only, retry, stop on repeated errors)
- `src/lexuz/parser.ts` (cheerio): title, dates, edition date, article split (*modda*), uz + ru versions
- `pnpm ingest:core`: imports or replaces each core act from lex.uz, `source = 'lexuz'`, `core = true`, `status_checked = true` after a manual check, then chunks and embeds it
- Anchor sets: `/search` always adds the top matches from the anchor acts for the given `docType`

**Done when:** all core acts present in uz (and ru where lex.uz has it) with current edition dates; parser tests on saved HTML fixtures; anchor acts appear in results for each `docType`.

### Phase 10 — Search quality pass (1–2 days) → Sync 2 with B
**Build**
- Tune RRF weights, chunk sizes, anchor count from `eval:search` failures
- Boost `core` acts and higher-ranking act types (Constitution > code > law > decree > resolution)
- Read B's review-eval failures labelled "retrieval" and fix them

**Done when:** **recall@10 ≥ 0.8**; p95 < 300 ms; B confirms citations work end to end.

### Phase 11 — Document text extraction (2 days)
**Build** `src/documents/`:
- `POST /documents/extract` (multipart, ≤ 20 MB, type checked by magic bytes, not only the header)
- PDF via `unpdf`: text + page count; `scanned = true` when there is almost no text layer
- DOCX via `mammoth`
- Language/script detection; Cyrillic Uzbek also returned transliterated in `text` for search
- Processed in memory only; request body excluded from logs

**Done when:** e2e tests with real PDF/DOCX fixtures (uz Latin, uz Cyrillic, ru); a scanned PDF returns `scanned: true`; a 20 MB+ file → 413; a renamed `.exe` → 415.

**Status (2026-11-21):** built in `apps/api/src/law/documents/` as `DocumentProcessingService` behind the AI track's `DOC_PROCESSING` (no separate HTTP route: one backend). File type checked by bytes; upload route returns 413 / 415. Text is kept exactly as in the file (no transliteration), because AI edits must match it. Tests: `test/law/documents.spec.ts`, `test/law/upload-validation.spec.ts` (generated PDF/DOCX, uz Latin / uz Cyrillic / ru).

### Phase 12 — Clause splitter (2 days)
**Build** `src/documents/clauses.ts`:
- Detect numbering: `1.`, `1.1.`, `4.2)`, `I.`, `5-band`, `7-modda`, `Статья 7`, `Пункт 3`
- Each clause: `ref`, optional `heading`, `text`, character offsets into `text`
- Fallback: paragraph-based clauses when no numbering is found

**Done when:** tests on 10 real contracts; the offsets slice `text` back to each clause exactly.

**Status (2026-11-21):** built in `apps/api/src/law/documents/clauses.ts`. Also handles Roman sections, `N-bob` / `N-ilova` / `Глава` / `Раздел` / `Приложение`, Uzbek Cyrillic word numbering, a `preamble` clause for text before the first number, and keeps numbered lists inside their clause (clause numbers must count up). Each clause is exactly `text.slice(start, end)`. Tested on 10 realistic sample contracts (`test/law/fixtures/contracts.ts`: uz Latin, uz Cyrillic, ru); **to do: add anonymised real contracts** when the team has them.

### Phase 13 — `applyEdits` for DOCX (3–4 days) → Sync 3 with B
**Build** `src/documents/apply-edits.ts` + `POST /documents/apply-edits`:
- Unzip with `jszip`, read `word/document.xml`
- Build the paragraph text from runs (`<w:r><w:t>`), find `original` **exactly once**, replace across the runs it spans: keep the first run's formatting for the replacement, remove the emptied runs
- Throw `EditNotFoundError(index)` → 422 when `original` occurs 0 or 2+ times
- Apply edits in order; re-zip; output opens in Word and LibreOffice

**Done when:** fixtures pass (text split across runs, bold inside a sentence, tables, numbered lists, Uzbek apostrophes); the round-trip test shows unchanged paragraphs are byte-identical in the XML; **B's accept-edits route works with it**.

**Status (2026-11-21):** built in `apps/api/src/law/documents/apply-edits.ts`, behind `DocumentProcessingService.applyEdits` (no separate route: one backend). Also handles an `original` that spans paragraphs. Tests: `test/law/apply-edits.spec.ts` (14) and two real-DOCX tests in B's `test/revise-and-edits.spec.ts` (accept → version 2; changed document → 422 `EDIT_NOT_APPLICABLE`). **Not yet checked by hand in Word / LibreOffice**: open one edited file in each before release.

### Phase 14 — lex.uz daily sync (2–3 days)
**Build** `src/sync/`:
- `@nestjs/schedule` cron (daily, at night) guarded by a Postgres advisory lock so only one instance runs it; disabled unless `SYNC_ENABLED=true`
- Read `lex.uz/uz/rss` → for items that amend a **core** act, re-fetch it with the Phase 9 parser → replace its articles → re-chunk → re-embed
- `law_sync_runs` row per run; idempotent (key = act id + edition date); no partial writes (one transaction per act)
- `GET /meta` shows `lastSyncAt` and the new `indexVersionDate`

**Done when:** a test with a saved RSS fixture updates one act; running twice changes nothing; a failed fetch leaves the old version intact.

### Phase 15 — Russian coverage (2 days)
**Build**
- Russian text for core acts (lex.uz `/ru/` pages, or HF `uzbek-legal-corpus-v1` for the 20 codes)
- `/search` accepts Russian queries and searches Russian rows too (`language` filter, `russian` text-search config for those rows)

**Done when:** Russian queries in `eval:search` (add 30) reach recall@10 ≥ 0.75.

### Phase 16 — Production readiness (2 days)
**Build**
- Multi-stage `Dockerfile`; runs migrations on deploy, not on every boot
- Rate limit per API key; request size limits; timeouts
- Metrics in `/meta`: index size, last sync, failed fetches
- README: setup, ingest order (`ingest:hf → ingest:chunk → ingest:embed → ingest:core`), env vars, the API

**Done when:** a fresh machine goes from empty to a searchable index by following the README alone; the container passes `/health` in staging.

---

## 5. Timeline and hand-offs to Developer B

| Week | Phases | Hand-off to B |
|---|---|---|
| 1 | 1, 2, 3, 4 | API contract (`src/contract.ts`) on Day 1 |
| 2 | 5, 6, 7 | **Sync 1:** `/search` (keyword), `/articles/batch`, `/meta` on staging |
| 3 | 8, 9 | Hybrid search live |
| 4 | 10, 11 | **Sync 2:** search quality confirmed; `/documents/extract` |
| 5 | 12, 13 (start) | Clauses in `/documents/extract` |
| 6 | 13 | **Sync 3:** `/documents/apply-edits` |
| 7 | 14 | Daily sync running |
| 8 | 15, 16 | Russian search, production deploy |

About 30 working days in total. Until Phase 6 lands, B works against a fake `LawSearchService` that returns fixture hits in the §3 shape.

---

## 6. Rules for every phase
- `pnpm build && pnpm lint && pnpm test` green before merging; e2e tests for every route
- ESM: relative imports end in `.js`
- Every request body validated with zod; every response matches `src/contract.ts`
- No document bytes or text in the DB or logs; no API keys in the repo
- lex.uz requests only in `ingest:*` commands and the sync job, at ≥ 2 s spacing
- One phase per PR; anything outside the phase goes to a new issue
