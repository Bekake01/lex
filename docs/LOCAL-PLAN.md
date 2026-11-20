# Lex: how we build and run it (local plan)

**Status: 2026-11-21.** This page explains how the team runs Lex **on our own computers** while we build it: who works where, how code and heavy jobs move between machines, and what is left. **Production (servers, real users) is a later step**; the last section lists only what we will decide then.

---

## 1. What Lex is, in one minute

A sender uploads a contract (PDF or Word). The AI checks it against **Uzbek law**, explains the problems with links to real law articles, and on request proposes corrections. The sender accepts them, which creates a new version of the document, and sends it for signature. The receiver opens a one-time link, reads a plain summary of their obligations, and signs.

It's one repository, `lex`, with three apps:

| App | What it is | Port |
|---|---|---|
| `apps/api` | The only backend (NestJS): users, documents, AI review, law search, signing | 5000 |
| `apps/web` | Sender dashboard (Next.js) | 3000 |
| `apps/sign` | Page the receiver opens to read and sign (Next.js) | 3001 |

It also uses **Postgres** (with the `pgvector` extension, for law search) and **Redis** (for the AI job queue).

---

## 2. Who builds what

| Person / team | Area | Main folders |
|---|---|---|
| **Developer A** (law track) | Law data, law search, reading contracts (PDF/Word), applying edits to Word files | `apps/api/src/law/` |
| **Developer B** (AI track) | AI review, correction chat, summaries for signers, usage limits | `apps/api/src/ai-review/`, `src/documents/`, `src/signature-requests/`, `src/signing/`, `src/usage/` |
| **Frontend team** | Dashboard and signing pages | `apps/web`, `apps/sign` |
| **Friend's MacBook** | Heavy jobs (big imports, embeddings, measurements); no feature code | — |

Developer B's own task list is in [`dev-b-next-steps.md`](dev-b-next-steps.md).

### External services

| Service | Used for | Key in `apps/api/.env` |
|---|---|---|
| **OpenAI** | The AI review, corrections and summaries (default model `gpt-5`) | `OPENAI_API_KEY` |
| **Voyage AI** | Embeddings for meaning-based law search (`voyage-3.5`) | `VOYAGE_API_KEY` |

Keys stay in each person's own `.env`. They're never committed or pasted in chat.

---

## 3. The machines and what each one does

| Machine | Good for | Not for |
|---|---|---|
| **Developer A's Windows laptop** (7.7 GB RAM, little free disk) | Writing code, small tests, the law subset | Full data imports, embedding all laws, running every test in parallel |
| **Friend's MacBook** (fast, room to spare) | Heavy jobs: the full law import, embedding all laws, quality measurements | Writing feature code (that stays with A and B) |
| **Developer B's machine** | AI work, real OpenAI runs | — |

**How work moves between machines:**

```
   code + small result files                code + small result files
A's laptop ── git push ──►  GitHub (lex, branch z-ai)  ◄── git push ── friend's Mac
                               ▲         │
                    git pull   │         │  merge into main when a piece is ready
                               │         ▼
                      Developer B, frontend team (branch main)
```

- **Git carries code and small text reports only.** The law dataset (163 MB), the databases and the embeddings are **never** in git: they're too big, and git ignores them on purpose.
- So each machine **builds its own database** with the same commands (`pnpm ingest:hf`, `pnpm ingest:embed`). The Mac's database is for **measuring**; production builds its own later.
- **Branches:** A works on `z-ai` and merges into `main` when a piece is ready. Before starting work, run `git pull origin main` to get the team's changes.

---

## 4. Run the whole app on your computer

### 4.1 One time

1. Install **Node 24**, **pnpm** and **Git**.
2. Get the code and install packages:
   ```bash
   git clone https://github.com/Bekake01/lex.git
   cd lex
   git checkout z-ai
   pnpm install
   ```
3. Create `apps/api/.env` from the template:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   Then fill in at least:
   - `JWT_SECRET`: any random text of 32 or more characters
   - `OPENAI_API_KEY`: for AI reviews
   - `VOYAGE_API_KEY`: for meaning-based law search; without it, search is keyword-only

### 4.2 Start Postgres and Redis

| Your computer | How |
|---|---|
| **Mac or Linux with Docker** | `pnpm services:up` (Postgres on port 5434, Redis on 6379) |
| **Windows without Docker** (A's laptop) | Postgres and Redis run in **WSL Ubuntu**. After every restart, run in PowerShell: `wsl -d Ubuntu -u root -- bash -c "service postgresql start && service redis-server start"` |

In `apps/api/.env`, these should be:
```
DATABASE_URL=postgres://lex:lex@localhost:5434/lex
REDIS_URL=redis://localhost:6379
```

### 4.3 Create the tables

```bash
cd apps/api
pnpm db:migrate
```

Run this again whenever someone adds a migration; it's noted in `memory/CHANGELOG.md`.

### 4.4 Load law data (pick one)

| Option | Command (in `apps/api`) | Disk | When |
|---|---|---|---|
| **None** | — | 0 | The AI review falls back to a few built-in sample articles. Fine for UI work. |
| **Codes and laws subset** | `pnpm ingest:hf --types code,law,constitution` | ~0.5 GB | Small laptops; covers every contract type we test |
| **Everything** | `pnpm ingest:hf` | ~3 GB | The Mac and production |

Download the dataset first; [`heavy-jobs-mac.md`](heavy-jobs-mac.md) section 1 has the command.

Then, **optionally**, add embeddings for meaning-based search (Voyage key needed):
```bash
pnpm ingest:embed --limit 2000
pnpm ingest:embed
```
The first command is a quick trial; the second embeds everything. For the full corpus that costs about $7–10 and takes 1–2 hours, so do it on the Mac (Job E).

### 4.5 Start the apps

```bash
pnpm dev:api     # backend   → http://localhost:5000
pnpm dev:web     # dashboard → http://localhost:3000
pnpm dev:sign    # signing   → http://localhost:3001
```

`pnpm seed:demo` fills the database with a demo sender, a finished review and a sent signature request, so the frontend has something to show.

### 4.6 Check that everything works

```bash
cd apps/api
pnpm build && pnpm lint
pnpm test --maxWorkers=2     # on small laptops; plain `pnpm test` can run out of memory
pnpm test:e2e                # needs Postgres and Redis running
```

---

## 5. Where we are

### Law track (Developer A)

| Phase | What | Status |
|---|---|---|
| 1–3 | Setup, database tables, Uzbek text tools | ✅ |
| 4–5 | Import 54k law articles from Hugging Face; split long ones (189k rows) | ✅ checked on the full data (Mac) |
| 6 | Keyword law search | ✅ |
| 7 | Search quality test (102 queries) + embedding choice | ✅ **Voyage** chosen; keyword R@10 91.3% |
| **8** | **Hybrid search (keyword + Voyage)** | 🔨 **code done; needs the Mac run (Job E) to measure** |
| 9 | Hand-checked core laws from lex.uz, anchor laws per contract type | next |
| 10 | Search tuning (known misses + B's "retrieval gaps") | after 9 |
| 11 | Read PDF and Word contracts | ✅ |
| 12 | Split contracts into clauses | ✅ (still to check: Word's automatic numbering) |
| 13 | Apply AI edits to Word files, keeping formatting | ✅ (still to check: open a result in Word and LibreOffice) |
| 14 | Daily lex.uz sync (marks repealed laws, such as the 1995 Labour Code) | later |
| 15–16 | Russian coverage, production readiness | later |

### AI track (Developer B)

Built: review, correction chat, accepting edits (with A's Phase 13), versions, signer summaries, usage limits. The AI layer runs on **OpenAI**.

Still to do (details in [`dev-b-next-steps.md`](dev-b-next-steps.md)):
1. A first real run with an OpenAI key.
2. 30–50 real contracts, marked by a lawyer, to measure quality.
3. Use the clause list in prompts.
4. Frontend hand-off.
5. Model and cost tuning.

### Open: owner not decided

- Email delivery (signing links are only logged today).
- Rendering the signing certificate.

---

## 6. What happens next, in order

1. **A:** push the Phase 8 code. **Friend:** `git pull`, run **Job E** in [`heavy-jobs-mac.md`](heavy-jobs-mac.md), and send back the two reports. **A:** record the numbers and close Phase 8.
2. **B:** first real OpenAI run, and start collecting eval contracts. These need nothing from A.
3. **Frontend:** wire the review screen and the signing summary, using `packages/contracts` and the demo seed.
4. **A:** Phase 9 (core laws from lex.uz), then Phase 10 tuning, using B's retrieval gaps.
5. **Whole team:** run the full flow once on one machine: upload, review, correct, accept, send, sign.

**Merge rule:** every change to the schema, routes, env vars or flow gets a line in `memory/CHANGELOG.md` and an update to `memory/STATE.md`, in the same commit, so everyone sees it on their next pull.

---

## 7. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| Tests crash with "out of memory" | Too many tests at once on a small laptop | `pnpm test --maxWorkers=2` |
| "Invalid environment: DATABASE_URL…" | Missing line in `apps/api/.env` | Copy it from `.env.example` |
| Can't connect to port 5434 or 6379 (Windows) | WSL services stopped after a restart | Run the `wsl … service … start` line from 4.2 |
| `Cannot find module '@lex/contracts'` | Shared packages not built | `pnpm --filter @lex/contracts --filter @lex/crypto build` |
| `ingest:embed` stopped halfway | Network or sleep | Run it again; it continues where it stopped |
| Disk full (A's laptop) | Datasets and test databases | Delete `apps/api/data/eval-db` and any `lex-hf-full-*` folders in `%TEMP%`; load only the subset |

---

## 8. Production: later

We'll plan this separately. The decisions to make then:

- **Hosting:**
  - where the API and the two web apps run;
  - managed Postgres **with pgvector**, and Redis;
  - file storage for documents (S3/R2 instead of the local `uploads/` folder).
- **Law data on the server:** run `pnpm ingest:hf` and `pnpm ingest:embed` there once, or copy the Mac's database. Then turn on the daily lex.uz sync (Phase 14).
- **Secrets:** OpenAI and Voyage production keys, with spending limits.
- **Uzbek law on personal data:** where user documents may be stored, and whether contracts may be sent to foreign AI providers.
- **Running it:** backups, monitoring, error tracking, CI (tests with Postgres and Redis), email delivery, the signing certificate.
