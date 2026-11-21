# MacBook run: what we need back

Thanks for running this! This page lists **only what to send us** after
Job E. How to run each step is in [`heavy-jobs-mac.md`](heavy-jobs-mac.md),
section 5 (steps E1–E6).

## Must have (3 things)

| # | What | Where to find it | Made by |
|---|---|---|---|
| 1 | `eval-phase8-keyword.txt` | `lex/apps/api/data/` | `pnpm eval:search --keyword-only --out data/eval-phase8-keyword.json` (step E6) |
| 2 | `eval-phase8-hybrid.txt` | `lex/apps/api/data/` | `pnpm eval:search --out data/eval-phase8-hybrid.json` (step E6) |
| 3 | The **last line** of `pnpm ingest:embed` | the terminal | step E5 (embed everything) |

Item 3 should say **`0 rows still without an embedding`**. If it shows a
bigger number, run `pnpm ingest:embed` again (finished rows are never paid for
twice), then send the new last line.

## Please also send (short, from the terminal)

These help us explain the numbers; copy-paste is fine.

- **`ingest:core` result:** the last line of step E3. It should be
  `Done: 16 ok, 0 failed`. If any act failed, send its line too.
- **`ingest:hf` result:** the last few lines of step E3 (how many acts and
  articles were loaded).
- **Embedding time and cost:** roughly how long E5 took, and the token count
  or dollar amount from the Voyage dashboard.
- **Any error or warning** you saw on the way, even if a rerun fixed it.

The `.json` files next to the `.txt` reports are welcome too, but not required.

## How to send

**Easiest:** paste or attach the two `.txt` files and the lines above in our
chat.

**If you have push access** (from the `lex` folder):

```bash
git pull origin z-ai
mkdir -p docs/decisions/results
cp apps/api/data/eval-phase8-*.txt docs/decisions/results/
git add docs/decisions/results
git commit -m "Results from the MacBook run (Job E)"
git push origin z-ai
```

Only add the result files. **Don't** add `apps/api/data/` or `apps/api/.env`.

## Please don't

- **Don't run `docker compose down -v`.** It deletes the database with the
  embeddings we paid for. To stop it safely: `docker compose stop`.
- Don't send the `.env` file or any API key in chat.

## Checklist

- [ ] `eval-phase8-keyword.txt`
- [ ] `eval-phase8-hybrid.txt`
- [ ] last line of `pnpm ingest:embed` (`0 rows still without an embedding`)
- [ ] last line of `pnpm ingest:core` (`Done: 16 ok, 0 failed`)
- [ ] last lines of `pnpm ingest:hf`
- [ ] E5 time + Voyage cost
- [ ] any errors or warnings
- [ ] database kept (`docker compose stop`, not `down -v`)

## What we do with it

We put the numbers in `docs/decisions/embeddings.md`, mark law Phases 8
(hybrid search) and 9 (core laws) as done, and use the queries hybrid search
still misses to start Phase 10 (search tuning).
