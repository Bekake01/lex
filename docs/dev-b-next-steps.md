# Developer B: what's left, and how to finish fast

For the AI track (`apps/api/src/ai-review/`, signature-request summaries, signing summary, usage). Updated 2026-11-21. Developer A (law track) wrote this from the current `z-ai` branch.

## What changed since your plan (read first)

1. **The AI provider is OpenAI, not Anthropic.** `ai.service.ts` uses the OpenAI Responses API (`openai` SDK). Your Zod schemas go out as strict JSON Schema (`ai-review/json-schema.ts`), and every answer is re-validated with Zod. The job processors and your public API didn't change. They build the neutral `AiContentBlock` (`{ type: 'text' }` or `{ type: 'pdf' }`) instead of Anthropic blocks.
   - **`.env`:** `OPENAI_API_KEY`, `AI_MODEL` (default `gpt-5`), `AI_EFFORT`. `ANTHROPIC_API_KEY` is gone.
   - Comments, tests and error messages say "the model" / "AI…", not "Claude".
2. **One backend.** lex-api was merged into `apps/api`. Law search is `SearchService` in `src/law/`, reached through your `DbLawSearchService` (`LAW_SEARCH_MODE=auto|db|fake`). There's no HTTP hop and no `x-lex-api-key`.
3. **Contract reading is real.** `DOC_PROCESSING` is now `DocumentProcessingService` (`src/law/documents/`), not the fake.
   - **DOCX reviews work.** PDFs return text, page count and `scanned` (no text layer, so you send the PDF itself).
   - Language detection: `uz-latn`, `uz-cyrl`, `ru`, `en` or `mixed`.
   - `extractText` throws `DocumentExtractionError` with a user-safe message. Your analyze job now shows it, instead of "Unexpected AI failure".
4. **Clauses are real.** `ExtractedDoc.clauses` covers `1.` / `1.1` / `4.2)` / `I.` / `5-band` / `7-modda` / `Статья 7` / `Пункт 3`, plus a `preamble` and a paragraph fallback (`p1`, `p2`…). Each clause has `ref`, an optional `heading`, and `start`/`end`. **`clause.text === text.slice(start, end)`, including the number.**
5. **Uploads check the real file type.** `POST /documents` returns **413** for files that are too large and **415** for a wrong or faked type (both were 400).
6. **Two fixes in your code:**
   - `StorageService` rejected every key on Windows (it compared paths with `/`). It now uses `path.relative`.
   - `DbLawSearchService` now passes `docType` through to search.
7. **Embeddings for search: Voyage `voyage-3.5`** (A's Phase 8). Nothing to do on your side: same `search()`, better ranking later.

## Your tasks, in order

### 1. First real run with OpenAI (half a day): nothing is proven until this works

Nobody has run a single real review since the switch to OpenAI.

1. In `apps/api/.env`, set `OPENAI_API_KEY`, `AI_MODEL` (the model your account has; `gpt-5` by default) and `AI_EFFORT=high`.
2. Run the 3 eval cases:
   ```bash
   cd apps/api && pnpm eval:review
   ```
3. Run the app end to end (`pnpm dev`, with Postgres and Redis up). Upload one Uzbek DOCX, one text PDF and one **scanned** PDF, then request a review for each.
4. Check:
   - **Structured output:** strict JSON Schema is accepted by your model. If you get `AI_UNPARSABLE`, a string limit such as `quote ≤ 600` was exceeded, so loosen it or reword the description.
   - **Scanned PDFs:** they reach the model as `input_file`.
   - **Summaries:** the summary job works at send time.
   - **Cost:** `ai_usage` rows show cost and token counts.
5. Write down the cost and time per document, and what failed.

**Done when:** all 3 eval cases and the 3 uploads finish with status `done`, and you've recorded the cost per document.

### 2. Real eval set: 30–50 contracts, marked by a lawyer (start now; it takes the longest)

Your plan's targets are **citation accuracy ≥ 95%** and **issue precision ≥ 80%**. Today there are 3 cases (`apps/api/eval/ai-review/cases/`).

1. Collect real contracts (rental, employment, sale, services, NDA). **Anonymise them**: names, passport numbers, addresses, phone numbers.
2. Have someone who knows the law mark the real issues in each. Use the case format in `cases/*.json`.
3. Start with **15** to unblock tuning, then grow to 30–50.
4. Run against the real law index, not the fixtures:
   ```bash
   LAW_SEARCH_MODE=db pnpm eval:review
   ```
   This needs law data loaded. On a small machine, use the codes and laws subset: `pnpm ingest:hf data/eval-subset.parquet`.
5. **Send A every `retrieval gap`**, as the query plus the article id that should have been found. A adds it to `apps/api/eval/search/queries.jsonl` and fixes search; that's A's job, not yours.

**Done when:** at least 30 cases exist and both target numbers have been measured.

### 3. Use the real clauses (1 day)

You now get reliable `clauses` with `ref`/`heading`/offsets. Use them:

- **In the prompt:** list the clause refs and headings (`1.1 Ijara haqi`, `7-modda`…) so the model's `clauseRef` uses the document's own numbering.
- **On save:** check `issue.clauseRef` and `edit.clauseRef` against the known refs. Keep unknown ones, but flag them (or map them to the clause that contains the `quote`).
- **For the frontend:** `start`/`end` let the review screen highlight a clause, so offer that to the frontend team.

**Done when:** most `clauseRef`s in the eval runs match a real clause ref.

### 4. Frontend hand-off (an hour, but do it now)

Tell the frontend team:
- `POST /documents` errors: **413** (too large) and **415** (not a real PDF/DOCX/text). Show them the server's message.
- Review failures now carry readable reasons, such as "The PDF file could not be read; it may be damaged or password-protected".
- `GET /sign/:token/summary` must be in the sign relay allowlist.
- The staging seed is `pnpm seed:demo`, and the mocks are in `packages/contracts/mocks/`.

### 5. Model and cost tuning (after task 1)

- Try `gpt-5-mini` for **classify** and **summaries**: they're simpler calls, so measure quality on the eval set. Keep the larger model for the **review** and **revise** calls.
- Keep `effort: 'medium'` for classify and summaries, as now, and check whether `high` really helps the review.
- Bump `AI_PROMPT_VERSION` whenever a prompt changes.

### 6. Accepting edits on DOCX: now works (A's Phase 13 landed)

`applyEdits` is real now: the replacement keeps the formatting of the run where it starts, and untouched paragraphs stay byte-identical.
- It throws your existing `EditNotFoundError(index)` when an `original` isn't found exactly once. Your `edits.service.ts` already maps that to **422 `EDIT_NOT_APPLICABLE`**, so no code change is needed.
- Two tests in your `test/revise-and-edits.spec.ts` now use a real DOCX with it. Still test by hand: accept → a new version, with version + 1, `parentDocumentId` and a new sha256 → a re-review starts → the old version stays untouched.

## Owners not decided yet (raise these with the team)

- **Email delivery:** `send-signing-invite` only logs the links. Resend is "the email track", but who owns it?
- **Signing itself:** consent, stamp, seal, and rendering the certificate. `@lex/crypto` has the hashing and the "Summary shown to signer: sha256 …" line, but nothing renders a certificate yet.
- **Full-app test:** `test/app-module.e2e-spec.ts` needs Postgres and Redis, so run it in CI or on a machine with Docker.
- **E2E teardown leaks Redis errors (yours to fix, small):** with Redis running, `pnpm test:e2e` passes all tests, but `test/app.e2e-spec.ts` leaves about 20 unhandled `ioredis` "Connection is closed" rejections when the app shuts down, so the run exits with code 1. Close the BullMQ queues and workers cleanly on shutdown, or stub the queue module in that test.

## Rules that keep us from colliding

- **You own** `src/ai-review/`, `src/documents/`, `src/signature-requests/`, `src/signing/`, `src/usage/` and `packages/contracts`.
- **A owns** `src/law/` and `src/law-search/db-law-search.service.ts`. Ask before changing them; they're shared contracts.
- **The provider stays in one file:** only `ai.service.ts` and `ai-errors.ts` may import `openai`.
- **Keep secrets and contracts out of logs:** no document text, prompts or keys in logs or error messages. Error messages are stored and shown to users.
- **Update the team notes:** every change to the schema, routes, env or flow gets a line in `memory/CHANGELOG.md` and an update to `memory/STATE.md`, in the same commit.
- **On small laptops,** run the tests as `pnpm test --maxWorkers=2`. The default can run out of memory, because each test file starts its own in-memory Postgres.
- **Before testing `apps/api` alone,** build the shared packages once:
  ```bash
  pnpm --filter @lex/contracts --filter @lex/crypto build
  ```

## What A is doing meanwhile

- **Phase 8:** hybrid search (keyword + Voyage). It needs all law articles embedded, which runs on a bigger machine. Better citations come with it, with no change on your side.
- **Later:**
  - Phase 9: hand-checked core acts from lex.uz, with `docType` anchor acts.
  - Phase 10: search tuning on your retrieval gaps.
  - Phase 14: daily lex.uz sync, which marks repealed acts such as the 1995 Labour Code.
