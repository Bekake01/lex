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

## 5. Job C2: OpenAI embedding test (about 10–20 minutes, needs the team's OpenAI key)

The app already uses OpenAI for the AI review, so its embeddings are a strong candidate. Ask the repo owner for an OpenAI key (best: a separate project key with a small spending limit). This run costs about $0.40–0.70.

```bash
echo 'OPENAI_API_KEY=paste-the-key-here' >> .env
set -a; source .env; set +a
HF_PARQUET=data/hf/articles.parquet \
  pnpm vitest run test/law/embed-eval.full.spec.ts
```

If both keys are in `.env`, one run does Voyage and OpenAI together; already-embedded parts come from the cache for free.

**What to send back:** `data/eval-embed-openai.txt` (plus the Voyage and keyword files if you ran them). **Never send or commit the `.env` file or the keys.**

---

## 6. Job D: bge-m3 embedding test (wait for the go-ahead)

bge-m3 is a free model that runs on your Mac. The test code doesn't support the easy Mac route yet, which is Ollama. Skip this job until the repo owner says it's added. The steps will then be:

```bash
brew install ollama
ollama serve &            # leave it running
ollama pull bge-m3        # ~1.2 GB download
```

There will then be one more test command.

---

## 7. Sending the results back

The easiest way is to send the `.txt` and `.json` files listed above in chat.

Or, if you have push access:

```bash
cd ../..                                   # back to the lex folder
git pull origin z-ai
mkdir -p docs/decisions/results
cp apps/api/data/eval-*.txt apps/api/data/report-import.json docs/decisions/results/
git add docs/decisions/results
git commit -m "Phase 7 results from the MacBook run"
git push origin z-ai
```

Only add the result files. **Don't** add `apps/api/data/` (it's large and git-ignored anyway) or `.env`.

---

## 8. Cleaning up afterwards

Everything is inside the `lex` folder. To free the space, delete the whole folder:

```bash
cd ~ && rm -rf path/to/lex
```

If you created a Voyage key, delete it in the Voyage dashboard, and tell the owner when you are done with the OpenAI key so they can revoke it.
