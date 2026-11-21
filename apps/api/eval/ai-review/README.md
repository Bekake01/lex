# Review eval set

What the AI review is measured against. Two numbers decide whether the review
is good enough to show a user:

| Metric                | Target | What it means                                                                                                       |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **Citation accuracy** | ≥ 95%  | Of the citations the model claimed, how many survived the server-side check — i.e. really were in the retrieved set |
| **Issue precision**   | ≥ 80%  | Of the issues the review reported, how many a lawyer had marked                                                     |

Issue recall, retrieval failures, invented citations and cost per document are
reported too, but only the two above are targets.

## Running it

```bash
cd apps/api
pnpm eval:review              # every case
pnpm eval:review rental-01    # one case
```

It needs `OPENAI_API_KEY` in `apps/api/.env`. **It spends real tokens**: one
classify call and one review call per case, roughly $0.10–0.50 each depending
on the contract's length.

Set `LAW_SEARCH_MODE=db` (with the law data loaded, `pnpm ingest:hf`) to
measure against the real law index; without it the run
uses the fixtures in `src/law-search/fixtures/`, which measures the prompt but
not retrieval. A result that says `law search fixtures` is not a retrieval
measurement.

The run writes `apps/api/eval-report.json` and exits non-zero when either
target is missed, so it can gate a PR later.

## Reading the output

Each dropped citation is labelled:

- **`retrieval gap`** — the article exists in the index but search did not
  return it. That is a search problem; the prompt is not at fault.
- **`invented citation`** — no such article anywhere. That is a model or prompt
  problem: tighten the instruction, or raise effort.

That split is the whole point of the label: it decides who fixes a failure.

## Adding a case

One JSON file per contract in `cases/`, shaped like `types.ts`:

```json
{
  "id": "rental-07",
  "notes": "Real rental contract from a Tashkent agency, 2026-03. Names, addresses and passport numbers replaced.",
  "docType": "rental",
  "language": "uz",
  "text": "…the whole contract…",
  "expectedIssues": [
    {
      "clauseRef": "3",
      "anyOf": ["oshirish", "ogohlantir"],
      "severity": "high"
    }
  ]
}
```

- `clauseRef` must be the clause number as written in the document; matching is
  by clause first.
- `anyOf` is a short list of words that any correct description of the problem
  would contain. Keep them specific enough not to match an unrelated finding
  and loose enough to survive rewording — one or two stems, not a sentence.
- Mark only issues a lawyer would actually raise. A padded expectation list
  makes precision look worse than it is and hides real regressions.
- A case with no `expectedIssues` is allowed and useful: a clean contract
  proves the review does not invent problems.

Every case is validated before the run spends anything (`case-schema.ts`). A
malformed file stops the run and names itself; text that still looks like a
phone number, passport number, INN/PINFL or email address is warned about, so
check the warning before committing.

**Anonymise before committing.** No names, addresses, passport or company
identifiers, phone numbers or bank details. The three cases in here now are
synthetic starters written to exercise the harness — replace them as real
anonymised contracts arrive. The target is 30–50 cases across rental,
employment, sale, services and NDA; **15 is enough to start tuning**, so don't
wait for the full set.

Collecting them is the slowest part and it needs people, not code: real
contracts, anonymised, with someone who knows the law marking what is
actually wrong in each.

## When a prompt changes

Bump `AI_PROMPT_VERSION` in the environment. Reviews record the version they
ran under, and the report carries it too, so a score always belongs to a known
prompt.
