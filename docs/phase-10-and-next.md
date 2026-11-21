# Law search: Phase 10 and what comes after

Written 2026-11-21, after the MacBook run (Job E). Owner: law track (Developer A).

## 1. Where we are

The Mac loaded every law (188,901 rows: 16 core laws from lex.uz + 24,251 acts
from Hugging Face), embedded all of them with Voyage, and measured search on
our 102 test queries. Reports: `docs/decisions/results/eval-phase8-{keyword,hybrid}.txt`.

| | Keyword only | Hybrid (keyword + Voyage) |
|---|---|---|
| R@10 (expected articles in the top 10) | 90.2% | **96.1%** |
| hit@10 (at least one right article in the top 10) | 94.1% | **98.0%** |
| MRR (how near the top the right article is) | 0.805 | **0.825** |
| Queries missed | 6 | **2** |
| Time per query, p50 / p95 | 916 / 1283 ms | 874 / 1246 ms |

**Phases 8 (hybrid search) and 9 (core laws from lex.uz) are done.** Hybrid
is clearly better than keyword alone, and the core laws load cleanly.

## 2. Phase 10: search tuning

Goal from `docs/law-build-plan.md`:

| Target | Now | Status |
|---|---|---|
| R@10 ≥ 80% | 96.1% | ✅ already met |
| **p95 < 300 ms** | **~1,250 ms** | ❌ the main work |
| The AI team confirms citations work end to end | not yet | ⏳ needs a real review run |

So Phase 10 has two jobs: **make search about 4× faster**, and **fix the few
queries it still gets wrong**.

### 2.1 Speed (the main job)

Keyword-only search is already ~900 ms, and hybrid runs keyword and vector
searches side by side in about the same time. **The keyword ranking is the
bottleneck.**

Why (from reading `src/law/search/search.service.ts`):
- The query is an OR of word prefixes (`'shaxs':* | 'doir':* | …`). Common
  words match tens of thousands of the 189k rows.
- For **every** matching row, the first stage counts how many query words the
  row contains (one text-search check per word) and computes `ts_rank`, then
  sorts them all to keep the best 300.
- With a contract type, the same ranking runs a second time limited to that
  type's anchor laws. A real review sends several queries, so this repeats.

Planned changes, in order (measure after each):
1. **Store each row's heading as its own indexed search column** (article
   title, or the act title for flat acts), instead of parsing it on every query.
2. **Cheaper first stage:** take candidates in two small, index-backed sets,
   "the heading matches" and "the body matches most of the words", instead of
   scoring every row that matches any one word.
3. **Check the vector query plan** (`EXPLAIN ANALYZE` on the Mac). The join on
   `law_acts` plus the "not repealed" filter may stop Postgres from using the
   HNSW index. If so, keep the status on `law_articles` too, or over-fetch and
   filter after.
4. If still slow: cache query embeddings, and cap the number of rankings fused
   for one review.

### 2.2 Quality: the queries still missed

| Query | What goes wrong | Planned fix |
|---|---|---|
| `pd-02` "shaxsga doir maʼlumotlarni uchinchi shaxslarga berish" | The right article's heading is literally "Shaxsga doir maʼlumotlarni berish", but it's short and lacks one query word, so it never makes the 300 candidates, and the heading check never sees it. Hybrid then fills the top 10 with Civil Code articles. | Heading candidates (2.1, step 2) fix this directly. |
| `nda-01` "tijorat siri tushunchasi" | A "what does X mean" question. The answer is the law's **"Asosiy tushunchalar"** (definitions) article, but articles with "tijorat siri" in the heading win. | When a query asks for a definition (`tushuncha`, `nima`, `deganda`, `degani`), boost the "Asosiy tushunchalar" article of the matching act. Every Uzbek law has one. |
| Personal data, weakest topic (R@10 72.2%; R@5 **fell** from 55.6% to 38.9% with hybrid) | These queries are tagged `docType: other`, and the personal-data law is an anchor only for NDA and employment contracts. | Make the personal-data law an anchor for **every** contract type: almost every contract handles someone's personal data. |
| Keyword misses that hybrid already fixes (`sale-05`, `emp-08`, `pd-01`, `gen-07`) | Fixed by hybrid. | Keep them in the eval so they stay fixed. |

Also from the plan (lower priority):
- **Boost by act rank:** Constitution > code > law > decree > resolution, and
  `core` acts a little higher.
- **Fusion weights:** try a bigger keyword weight or a different RRF `k`, but
  only with numbers to back it.
- **The AI team's "retrieval gaps":** each one becomes a new line in
  `apps/api/eval/search/queries.jsonl` and gets fixed here. None reported yet.

### 2.3 How we measure

- **Locally, quickly:** a separate database `lex_eval` (already created and
  migrated in the local Postgres, still empty) loaded with the 9,143-row
  sample `apps/api/data/embed-sample.parquet`. Keyword-only, no cost. Good
  enough to check the ranking fixes and compare before/after. It's too small
  for speed numbers.
- **On the Mac, for the real numbers:** after the changes, run step E6 again
  (`pnpm eval:search --keyword-only …` and `pnpm eval:search …`). It takes a
  few minutes and **costs almost nothing**: the embeddings are already in the
  database; only the 102 short queries get embedded. Send back the two `.txt`
  reports, same as last time (`docs/mac-results-request.md`).

### 2.4 Done when

- [ ] p95 < 300 ms for hybrid search on the Mac
- [ ] R@10 stays ≥ 96% (no step back), with `pd-02` and `nda-01` found
- [ ] Personal-data topic R@10 ≥ 90%
- [ ] Any new queries from the AI team pass
- [ ] Numbers recorded in `docs/decisions/embeddings.md`, `memory/` updated

### 2.5 Status (2026-11-21): code done, waiting for Mac numbers

Built (all in `apps/api`):

| Plan item | What was done | Where |
|---|---|---|
| 2.1 step 1 | `law_articles.heading_tsv` (GIN index), filled by a trigger on insert and on act rename; migration backfills existing rows | `drizzle/0008_law_heading_tsv.sql` |
| 2.1 step 2 | Keyword search scores only two index-backed sets: heading matches + rows with **most** of the words (all of 1–2, all but one of 3–5, all but two of 6+). The old "any word" ranking only runs when these give < 10 rows | `search.service.ts` `rankFocused` / `rankBroad`, `query.ts` `mostWordsTsQuery` |
| 2.1 step 3 | Vector query fixed without waiting for `EXPLAIN`: it sorted by distance **and** id, which HNSW can't serve (likely a full scan). Now: distance only, top 100 from HNSW (`ef_search` 100), drop repealed, keep 50. Anchor rankings use an exact scan over the anchor acts | `vectorRank` / `vectorRankIn` |
| 2.1 step 4 | Query embedding cache already existed (`EmbeddingService`); fusion cap not needed yet | — |
| `pd-02` | Found through the heading set | test `search-tuning.spec.ts` |
| `nda-01` | Definition queries (`tushuncha`, `nima`, `deganda`, `degani`, `taʼrif`, `maʼnosi`) boost the "Asosiy tushunchalar" article that mentions the topic (+1.5, +0.5 more when the act title is the topic) | `query.ts` `definitionTopic` |
| Personal data | The personal-data law (`-4396419`) anchors every contract type | `lexuz/core-acts.ts` |
| Act rank | Small tie-breaker: constitution 0.06, code 0.05, law 0.03, decree 0.01, core +0.02 (below the ts_rank scale) | `ACT_RANK_BOOST` |

**Mac run (Job F), from `lex/apps/api`, after `git pull`:**

```bash
pnpm db:migrate                 # 0008: fills heading_tsv for all ~189k rows (a minute or two)
pnpm eval:search --keyword-only --out data/eval-phase10-keyword.json
pnpm eval:search --out data/eval-phase10-hybrid.json
```

Send back `data/eval-phase10-{keyword,hybrid}.txt`, same as Job E. No Voyage
cost beyond the 102 query embeddings.

## 3. After Phase 10

### Law track

| Phase | What | Status | What's left |
|---|---|---|---|
| 1–7 | Setup, tables, import, keyword search, eval, embedding choice | ✅ | — |
| 8 | Hybrid search | ✅ | numbers above |
| 9 | Core laws from lex.uz + anchors | ✅ | a lawyer should review the list of 16 acts and anchors |
| **10** | **Search tuning** | 🔨 code done, measuring | Mac run (Job F, §2.5) |
| 11 | Read PDF / Word contracts | ✅ | — |
| 12 | Split contracts into clauses | ✅ | check Word's automatic numbering on real files |
| 13 | Apply AI edits to Word files | ✅ | open one edited file in Word and LibreOffice to check formatting |
| 14 | Nightly lex.uz sync | ✅ | turn on `SYNC_ENABLED=true` on the run machine |
| 15 | Russian coverage | ⏸ not needed for now (team decision) | — |
| 16 | Production readiness | later | with the production plan |

### AI track (Developer B, `docs/dev-b-next-steps.md`)

1. **First real run with an OpenAI key**: review, correction chat, and the
   signer summary (prompt `v4`) on a real contract. Not done yet.
2. **30–50 real contracts marked by a lawyer** to measure review quality
   (`pnpm eval:review`: citation accuracy ≥ 95%, issue precision ≥ 80%).
3. Send every "retrieval gap" (query + the article that should have been
   found) to the law track; they feed Phase 10.
4. Model and cost tuning.

### Whole team

- **End-to-end run on the Mac** (from `docs/review-wiring-plan.md`, Phase 9):
  sign up → upload a Word contract → review → ask for a correction → accept
  it (v2 + new review) → hit the free limit → review a PDF → send it → sign it
  in the sign app → download the sealed copy.
- **Open, no owner yet:** real delivery of signing links (email / Telegram /
  SMS; today they're only logged), forgot-password emails, Payme / Click.
