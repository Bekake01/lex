# Heavy jobs on a MacBook: law search checks and embedding test

Thanks for helping! These jobs need more disk space, RAM and CPU than the main dev laptop has. You only run tests and measurements. You don't write app code, and nothing here touches a production database.

**You need:** about 10 GB of free disk space, an internet connection, and 30–60 minutes (mostly waiting).

---

## 1. One-time setup

Install these if you don't have them:

- **Git** (`git --version` works on most Macs; otherwise run `xcode-select --install`)
- **Node.js 24**, from https://nodejs.org or with `brew install node@24`
- **pnpm**, with `corepack enable`. If that fails, run `npm install -g pnpm`.

Check that they're installed:

```bash
node --version    # v24.x
pnpm --version
```

Get the code. Ask the repo owner to add you as a collaborator on GitHub first if the repo is private.

```bash
git clone https://github.com/Bekake01/lex.git
cd lex
git checkout z-ai
pnpm install
```

Download the law dataset (163 MB):

```bash
cd apps/api
mkdir -p data/hf
curl -L -o data/hf/articles.parquet \
  https://huggingface.co/datasets/sukhrobnurali/uzbek-legal-corpus/resolve/main/articles/train-00000-of-00001.parquet
```

Run the remaining commands from `lex/apps/api`.

Check that the normal tests pass. This takes about 1 minute:

```bash
pnpm test
```

---

## 2. Job A: full-dataset checks (about 20–30 minutes, no account needed)

This imports all 54,000 law articles into a test database that runs inside Node, so no Docker or Postgres is needed. It checks three things:

- The import works.
- No stored row is too long.
- Search finds the right articles.

```bash
HF_PARQUET=data/hf/articles.parquet HF_REPORT=data/report-import.json \
  pnpm vitest run test/law/hf-import.full.spec.ts

HF_PARQUET=data/hf/articles.parquet \
  pnpm vitest run test/law/search.full.spec.ts
```

**What to send back:**

- The last lines of each command, which show `Tests  N passed`, or any errors.
- The file `data/report-import.json`.

---

## 3. Job B: keyword search score on codes and laws (about 5–10 minutes)

```bash
HF_PARQUET=data/hf/articles.parquet \
  pnpm vitest run test/law/search-eval.full.spec.ts
```

**What to send back:** the file `data/eval-keyword.txt`. For comparison, the dev laptop got R@10 91.3% and MRR 0.765.

---

## 4. Job C: Voyage embedding test (about 10–20 minutes, needs a free Voyage key)

1. Create an account at https://dash.voyageai.com and create an API key. New accounts include free tokens, and this test uses only about 3 million tokens (well under $1).
2. Put the key in a file named `.env` inside `apps/api`. This file stays on your Mac and is never committed:

   ```bash
   echo 'VOYAGE_API_KEY=paste-your-key-here' >> .env
   ```

3. Run the test:

   ```bash
   set -a; source .env; set +a
   HF_PARQUET=data/hf/articles.parquet \
     pnpm vitest run test/law/embed-eval.full.spec.ts
   ```

It embeds about 9,000 law articles. Progress lines show while it works. If it stops halfway (network or rate limit), run the same command again: finished parts are saved in `data/embed-cache/` and aren't paid for twice.

**What to send back:**

- `data/eval-embed-voyage.txt`
- `data/eval-embed-keyword.txt`

**Never send or commit the `.env` file or the key.**

---

## 5. Job E: embed all laws and measure hybrid search (Phase 8; about 2 hours, mostly waiting)

This is the big one. It loads every law into a **real Postgres**, sends all ~190,000 rows to Voyage once, and measures how much better hybrid search (keyword + Voyage) is than keyword search alone.

- **Cost:** roughly **$7–10** of Voyage usage for the whole corpus (about 120 million tokens by our estimate; Voyage may count up to ~1.5× more for Uzbek). Check the Voyage dashboard: new accounts get free tokens that may cover it. Set a spending limit first.
- **Disk:** about 5 GB.
- **Safe to stop:** if your Mac sleeps or the network drops, just run the same command again. Finished rows are saved and never paid for twice.

**E1. Start Postgres (with pgvector) and Redis.** The easiest way is Docker Desktop (https://www.docker.com/products/docker-desktop). From the `lex` folder:

```bash
cd ~/path/to/lex
git pull origin z-ai
pnpm install
pnpm services:up          # Postgres on port 5434, Redis on 6379
```

**E2. Settings.** In `apps/api/.env`, next to your `VOYAGE_API_KEY`, add these lines if they aren't there:

```bash
DATABASE_URL=postgres://lex:lex@localhost:5434/lex
REDIS_URL=redis://localhost:6379
JWT_SECRET=any-long-random-text-at-least-32-characters-long
EMBEDDING_PROVIDER=voyage
```

**E3. Create the tables and load all laws** (about 5–10 minutes):

```bash
cd apps/api
pnpm db:migrate
pnpm ingest:hf            # reads data/hf/articles.parquet (download step in section 1)
```

**E4. Try embeddings on 2,000 rows first** (about 1 minute; checks the key and shows the speed):

```bash
pnpm ingest:embed --limit 2000
```

**E5. Embed everything** (1–2 hours). It prints progress and the time left; leave it running.

```bash
pnpm ingest:embed
```

It should end with `0 rows still without an embedding`. If not, run it again.

**E6. Measure.** This takes a few minutes and makes two reports: keyword-only, then hybrid.

```bash
pnpm eval:search --keyword-only --out data/eval-phase8-keyword.json
pnpm eval:search --out data/eval-phase8-hybrid.json
```

**What to send back:**
- `data/eval-phase8-keyword.txt` and `data/eval-phase8-hybrid.txt`
- the last line printed by `pnpm ingest:embed`

**Keep the database.** Don't run `docker compose down -v`: it would delete the embeddings you paid for. To stop it without deleting anything, run `docker compose stop`.

---

## 6. Job D: bge-m3 embedding test (not needed: Voyage was chosen)

Skip this. Voyage was chosen in Phase 7, and bge-m3 is only a self-hosted fallback.

---

## 7. Sending the results back

The easiest way is to send the `.txt` and `.json` files listed above in chat.

Or, if you have push access:

```bash
cd ../..                                   # back to the lex folder
git pull origin z-ai
mkdir -p docs/decisions/results
cp apps/api/data/eval-*.txt apps/api/data/report-import.json docs/decisions/results/ 2>/dev/null
git add docs/decisions/results
git commit -m "Results from the MacBook run"
git push origin z-ai
```

Only add the result files. **Don't** add `apps/api/data/` (it's large and git-ignored anyway) or `.env`.

---

## 8. Cleaning up afterwards

Only clean up when the team says Phase 8 is done (the database holds the paid-for embeddings). Then stop and delete the database, and the folder:

```bash
cd ~/path/to/lex && docker compose down -v
```


```bash
cd ~ && rm -rf path/to/lex
```

If you created a Voyage key, delete it in the Voyage dashboard.
