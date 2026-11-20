# Decision: embedding model for law search (Phase 7)

**Status: decided — Voyage `voyage-3.5` (1024 d).** Chosen by the team on 2026-11-21: measured on the MacBook run (raw reports in [`results/`](results/)), roughly equal to keyword search on its own and complementary to it, cheap (about $0.06 per million tokens), nothing to host, and the team already has a `VOYAGE_API_KEY`. OpenAI embeddings were dropped (not used by the team); bge-m3 stays as a self-hosted fallback in the code but is not planned. Config: `EMBEDDING_PROVIDER=voyage`, `VOYAGE_API_KEY` in `apps/api/.env`.

## What we measure

- Query set: `apps/api/eval/search/queries.jsonl`, 102 queries in Uzbek (2 in Cyrillic, 1 with an ASCII apostrophe) over 8 topics: rental 20, employment 20, sale 18, services 12, general contract law 10, NDA 8, consumer 8, personal data 6. Each lists the article ids that answer it (127 in total, all checked to exist in the dataset). Written by the AI team from article headings, **not yet reviewed by a lawyer**.
- Scored at article level (parts `-pN` of a split article count as the article):
  - **R@5 / R@10**: share of a query's expected articles in the top 5 / 10, averaged over queries.
  - **hit@10**: share of queries with at least one expected article in the top 10.
  - **MRR**: mean of 1 / rank of the first expected article.
- Code: `apps/api/src/law/eval/search-eval.ts`. Run against a loaded database with `pnpm eval:search`.

## Results

### Keyword search (Phase 6), codes + laws + Constitution

2,089 acts (all 259 codes, 1,717 laws, 113 constitutional acts), 39,363 rows after chunking. This is ~12% of the corpus by text; it holds every expected article and the hardest distractors (the repealed 1995 Labour Code, older editions of the Tax Code, amending laws). The 16,700 government resolutions are not in it, so these numbers are optimistic for the full corpus.

| topic | n | R@5 | R@10 | hit@10 | MRR |
|---|---|---|---|---|---|
| **all** | 102 | 87.6% | **91.3%** | 95.1% | **0.765** |
| rental | 20 | 85.8% | 93.3% | 100% | 0.668 |
| sale | 18 | 88.9% | 93.5% | 100% | 0.831 |
| services | 12 | 95.8% | 100% | 100% | 0.794 |
| employment | 20 | 90.0% | 90.0% | 90.0% | 0.828 |
| nda | 8 | 81.3% | 87.5% | 87.5% | 0.693 |
| personal data | 6 | 77.8% | 77.8% | 83.3% | 0.617 |
| consumer | 8 | 87.5% | 93.8% | 100% | 0.750 |
| general | 10 | 85.0% | 85.0% | 90.0% | 0.833 |

Missed in the top 10 (5): the right law is found but a neighbouring article ranks first.

- `emp-08` notice period for dismissal → wants Labour Code art. 165; gets art. 116, 166
- `emp-18` disciplinary sanctions → wants art. 312; gets a civil-service law, art. 313
- `nda-01` definition of a trade secret → wants art. 3; gets art. 11, 6, 10
- `pd-02` transfer of personal data to third parties → wants art. 13; gets art. 25, 22
- `gen-07` contract by offer and acceptance → wants Civil Code art. 367, 370; gets art. 373, 372

Speed on PGlite (in-process, single-user): p50 1.7 s / p95 4.2 s per query on the dev laptop, **p50 190 ms / p95 344 ms on the MacBook** (same numbers otherwise, so the eval is reproducible). Real Postgres is measured in Phase 8 (target p95 < 300 ms for 5 queries).

### Full corpus import (Phase 4 + 5 check, MacBook)

All 54,173 dataset rows: 11 too-short skipped, 16,161 long articles split into 150,880 parts, **188,881 rows stored, largest 1,498 tokens** (limit 1,600), all 24,267 acts, 111 s. Full-dataset import and search tests passed.

### Embedding comparison, ~30-act sample

The 9 acts the queries expect plus the 21 largest other codes and laws (excluding amending acts), split like the real import: 9,143 rows, ~2.9 M tokens. That is roughly $0.17 with voyage-3.5 ($0.06 / M tokens). Vectors are cached in `apps/api/data/embed-cache/`, so re-runs are free.

| retrieval on the sample | R@5 | R@10 | hit@10 | MRR |
|---|---|---|---|---|
| keyword (Phase 6) | 91.3% | 93.1% | 96.1% | 0.831 |
| voyage-3.5, vectors only | 87.3% | **93.5%** | 96.1% | 0.807 |
| bge-m3, vectors only | — | — | — | — |

Voyage per topic: rental 92.5% R@10, sale 87.0%, services 100%, employment 95.0%, NDA 93.8%, personal data 94.4%, consumer 100%, general 90.0% (full table in `results/eval-embed-voyage.txt`). Embedding the sample took 310 s.

Voyage and keyword search **miss different queries**:

| query | keyword | voyage |
|---|---|---|
| `nda-01` definition of a trade secret | missed | found |
| `pd-02` personal data to third parties | missed | found |
| `gen-07` offer and acceptance | missed | found |
| `emp-08` dismissal notice period | missed | found |
| `emp-20` Cyrillic: grounds to end an employment contract | found | **missed: returned the repealed 1995 Labour Code** |
| `rent-08` form of a lease contract | found | missed (Law on Lease instead of Civil Code) |
| `sale-03` delivery deadline for goods | found | missed |
| `gen-09` liability for a money obligation | found | missed |

## Reading so far

- **Voyage alone is not better than keyword search** (R@10 +0.4 points, MRR −0.024), but its misses barely overlap keyword's: a hybrid (Phase 8, reciprocal rank fusion) should beat both. That, not vector-only R@10, is the case for embeddings here.
- Vectors do not transliterate: a Cyrillic query matched the Cyrillic-era 1995 Labour Code. Phase 8 should embed the **normalized Latin** query (`normalizeQuery`), and old acts need `repealed` status (Phase 14) or demotion.

- Keyword search already clears the Phase 8 target (R@10 ≥ 0.75) on codes and laws. Its misses are about **ranking inside the right law**, which is where embeddings usually help.
- Embeddings should be judged on what keyword search misses: paraphrased questions ("can the landlord end the lease early") and **MRR** (the right article first), not on R@10 alone.
- **What this means for Phase 8:** use Voyage in a hybrid with keyword search (reciprocal rank fusion), embed the normalized Latin form of each query, and re-run `eval:search` with the hybrid to confirm it beats both (target R@10 ≥ 0.75 is already met; the aim now is MRR, the right article first).

## Re-running the comparison

In `apps/api` with `VOYAGE_API_KEY` set: `HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/law/embed-eval.full.spec.ts` (reports in `data/eval-embed-*.txt`; cached vectors make re-runs free). For bge-m3 add `EMBEDDING_URL` pointing at a text-embeddings-inference server.
