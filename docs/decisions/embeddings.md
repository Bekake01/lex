# Decision: embedding model for law search (Phase 7)

**Status: open.** Keyword baseline measured. Three candidates, all 1024-d (no schema change): **OpenAI `text-embedding-3-large`** (reuses the team's `OPENAI_API_KEY`; the AI review runs on OpenAI too), **Voyage `voyage-3.5`** and **bge-m3** (self-hosted). The runs are waiting on keys and a bge-m3 server (see "How to finish").

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

Speed on PGlite (in-process, single-user, much slower than Postgres): p50 1.7 s, p95 4.2 s per query. To be measured on real Postgres in Phase 8 (target p95 < 300 ms for 5 queries).

### Embedding comparison, ~30-act sample

The 9 acts the queries expect plus the 21 largest other codes and laws (excluding amending acts), split like the real import: 9,143 rows, ~2.9 M tokens. That is roughly $0.17 with voyage-3.5 ($0.06 / M tokens) and $0.40–0.70 with text-embedding-3-large ($0.13 / M; OpenAI counts more tokens for Uzbek than our estimate). Vectors are cached in `apps/api/data/embed-cache/`, so re-runs are free.

| retrieval on the sample | R@5 | R@10 | hit@10 | MRR |
|---|---|---|---|---|
| keyword (Phase 6) | 91.3% | 93.1% | 96.1% | 0.831 |
| OpenAI text-embedding-3-large (1024 d), vectors only | — | — | — | — |
| voyage-3.5, vectors only | — | — | — | — |
| bge-m3, vectors only | — | — | — | — |

## Reading so far

- Keyword search already clears the Phase 8 target (R@10 ≥ 0.75) on codes and laws. Its misses are about **ranking inside the right law**, which is where embeddings usually help.
- Embeddings should be judged on what keyword search misses: paraphrased questions ("can the landlord end the lease early") and **MRR** (the right article first), not on R@10 alone.
- The choice rule, once the runs exist: pick the model with the higher vector-only R@10 on the sample; if within 2 points, prefer the higher MRR; if still tied, prefer **OpenAI** (one provider and one key for the whole app, nothing to host), then Voyage, then bge-m3 (a server to run and patch).

## How to finish

1. Put `OPENAI_API_KEY=…` and/or `VOYAGE_API_KEY=…` in `apps/api/.env`. Each run costs under $1; set a spending limit on the key you use.
2. For bge-m3, run a text-embeddings-inference server where there is room (the model is ~2.3 GB), for example
   `docker run -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-latest --model-id BAAI/bge-m3`,
   and set `EMBEDDING_URL=http://localhost:8080`.
3. In `apps/api`: `HF_PARQUET=data/hf/articles.parquet pnpm vitest run test/law/embed-eval.full.spec.ts`
   (reports in `data/eval-embed-*.txt`), fill in the table, and set `EMBEDDING_PROVIDER` in `.env.example`.
