# Plan: real documents on the review screen (`/review`)

**Status (2026-11-21): Phase 1 done; phases 2–9 (web) not started.**

## Goal

A user uploads their own contract, and the review screen shows the **real** AI review: problems with law citations, the contract text with the problem clauses highlighted, the correction chat, and accepting edits, which creates a new Word version.

## Where we start

- **The API is ready.** These routes are live and tested:
  - upload, start review, poll review;
  - chat messages;
  - accept and reject edits (Word edits work since law Phase 13).
- **The screen is fake.** `apps/web/src/components/review/ReviewWorkspace.tsx` loads a hardcoded contract and review from `lib/demo.ts`, and a timer imitates the analysis. The home-screen upload only saves the file name (`AskChat.tsx:79`, `TODO`).
- **One route is missing:** the document's text, which the left pane needs to show the contract and highlight clauses.

## How it will work

```
upload (home or Hujjatlar)
   └─ POST /documents ──► /review?doc=<documentId>
                              ├─ GET /documents/:id/reviews   reuse the newest review, or
                              ├─ POST /documents/:id/reviews  start one (402 → upgrade dialog)
                              ├─ GET /reviews/:id             poll every 2 s: queued → running → done | failed
                              ├─ GET /documents/:id/text      contract text + clause positions
                              ├─ POST/GET /reviews/:id/messages   chat; edits arrive inside messages
                              └─ POST /reviews/:id/edits/accept   → new version → /review?doc=<newId>
```

The URL holds the document id, so a reload, a link from Hujjatlar, or the back button all work.

## Phases

Each phase is small, can be merged on its own, and leaves the app working. Phase 1 is backend, the law track's part. Phases 2–9 are web, the frontend team's part unless we agree otherwise.

### Phase 1: document text route (API) ✅

- `GET /documents/:id/text` returns `{ text, clauses, scanned }`:
  - `text` is the extracted text the review used;
  - `clauses` are `{ref, heading, start, end}`, the same offsets as `issue.clauseRange`;
  - for a scanned PDF it returns `text: ''` and `scanned: true`.
- It reads stored text and never re-extracts, so it's fast. It works only for the owner (404 otherwise, like `GET /documents/:id`), and only once the document has been read (409 before the first review).
- Contracts, add-only:
  - `documentTextWireSchema`;
  - `API_PATHS.documentText`;
  - the missing `API_PATHS.rejectEdits`;
  - a mock in `packages/contracts/mocks/`.
- Fix `docs/ai-frontend-handoff.md`: remove the old "501 EDITS_NOT_AVAILABLE" note and add the new route.
- **Done when:** a test covers owner, stranger, not-read-yet and scanned, and `curl` returns the seeded demo document's text.

### Phase 2: review API client (web)

- New `apps/web/src/lib/review.ts`, with one function per route. Each uses `apiFetch` and the `@lex/contracts` types, and throws `ApiError` with the server's `code` and `message`.
- `poll(fn, isDone, everyMs)`: stops on done, on unmount and on errors, and backs off to 5 s after a minute.
- **Demo mode:** with `NEXT_PUBLIC_DEMO_LOGIN=1` the client answers from `@lex/contracts/mocks/*.json`, so the screen still works without the API.
- **Done when:** the file type-checks and nothing uses it yet.

### Phase 3: upload goes to the API (web)

- Home screen (`AskChat.tsx`): the "Hujjat yuklaş" pill and drag-and-drop call `POST /documents`, then `router.push('/review?doc=<id>')`.
- Hujjatlar (`Documents.tsx`): "Hujjat yuklaş" does the same for one file. Rows in "Mening hujjatlarim" link to `/review?doc=<id>`.
- Errors: show the server's message for 413 and 415, as the send flow already does.
- **Done when:** uploading a real PDF or Word file lands on `/review?doc=…`. The screen there is still the demo.

### Phase 4: start the review and wait (web)

- `/review` reads `?doc=`. Without it, the page shows a short "upload a document" screen.
- It uses the newest review of that document if one exists (no second charge after a reload). Otherwise it starts one.
- **Waiting state:** the three step labels stay, but they follow real `status` (`queued` → step 1, `running` → steps 2–3), with the note "Odatda 20–60 soniya". There's no fake timer.
- **Failed:** show the review's readable reason, plus a "Qayta urinib köriş" button.
- **402:** open the upgrade dialog (`showUpgrade()`) and show "Tekşiruvlar tugadi" with a link to `/pricing`.
- After the review starts, call `billingChanged()` so the sidebar meter updates.
- **Done when:** a real upload shows a real waiting state and then the raw review data. The finished-review layout can still be rough at this point.

### Phase 5: show the findings (web)

- `ReviewCard` uses `ReviewWire`:
  - `riskLevel`, `verdict` and `summary` at the top;
  - each issue shows its severity, `problem`, `quote`, `recommendation`, and its citation with `actTitle`, `articleNumber`, a lex.uz link (`sourceUrl`) and `versionDate`.
- `citation: null` shows "Qonun manbasi topilmadi". Never make one up.
- Sort by severity. Show the "N ta jiddiy" count, as the demo does.
- Remove the demo-only types from the review components (`lib/demo.ts` keeps what Hujjatlar still uses).
- **Done when:** a real review renders fully, and the demo mock renders the same way.

### Phase 6: contract text and highlighting (web)

- `DocumentPane` loads `GET /documents/:id/text` and renders the text by clause. Clicking an issue scrolls to `issue.clauseRange` and highlights it; clicking a highlighted clause selects its issue.
- **No `clauseRange`:** show `clauseRef` as text and don't highlight.
- **Scanned PDF:** show the PDF itself (`GET /documents/:id/file`, the PDF viewer the send flow already uses) with a note that highlighting needs a text layer.
- **Done when:** issues and clauses link both ways on a Word file and on a text PDF.

### Phase 7: correction chat (web)

- `GET /reviews/:id/messages` loads the history. Sending a message calls `POST /reviews/:id/messages`, then polls the messages until the assistant message stops being `pending`.
- The quick buttons ("Eng katta xavf nima?", "Hammasiga taklif tayyorla") send real messages.
- **Done when:** a question gets a real answer, and a reload keeps the history.

### Phase 8: accept and reject edits (web)

- Edits arrive in `message.edits[]`. Each one shows as original → replacement, with its reason and citation, and buttons for **Qabul qiliş** and **Rad etiş**. There's also **Hammasini qabul qiliş**.
- Accept calls `POST /reviews/:id/edits/accept {editIds}`, which returns `{documentId, version}`. The page then says "Yangi versiya (v2) yaratildi" and moves to `/review?doc=<newId>`, where the automatic re-review is already running (Phase 4's waiting state).
- Errors, showing the server's message for each:
  - `422 EDITS_NEED_DOCX`: edits only work on Word; the suggested text stays visible to copy;
  - `422 EDIT_NOT_APPLICABLE`;
  - `409 NOT_LATEST_VERSION`, which also links to the newest version.
- A version switcher (`GET /documents/:id/versions`): "v1 · v2", read-only for old versions.
- **Done when:** on a Word contract, accepting an edit creates v2, the page shows its new review, and v2 downloads with the changed text.

### Phase 9: from review to signing, plus cleanup (web)

- **"Imzoga yuboriş"** on a finished review:
  - a PDF opens the existing send flow for that document;
  - a Word file shows "Imzolaş uçun PDF kerak" and explains how to convert it (sending is PDF-only, by team decision).
- The old demo "sign / request changes" dialog (`SignDialog.tsx`) is for a contract someone sent you. Signing that now happens in `apps/sign`, so remove the dialog.
- Update `docs/ai-frontend-handoff.md`, `memory/CHANGELOG.md` and `memory/STATE.md`.
- **End-to-end on the Mac:**
  1. sign up;
  2. upload a Word contract;
  3. review it;
  4. ask for a correction;
  5. accept it, which creates v2 and re-reviews it;
  6. hit the free limit and see the upgrade dialog;
  7. upload a PDF, review it and send it for signature.
- **Done when:** that run passes with no demo data on `/review`.

## Order and size

| Phase | Who | Size | Needs |
|---|---|---|---|
| 1. Text route | law track (us) | small | — |
| 2. API client | web | small | — |
| 3. Upload | web | small | 2 |
| 4. Start + wait | web | medium | 2, 3 |
| 5. Findings | web | medium | 4 |
| 6. Text + highlight | web | medium | 1, 5 |
| 7. Chat | web | medium | 4 |
| 8. Edits | web | medium | 7 |
| 9. Signing + cleanup | web | small | 5, 8 |

Phases 1 and 2 can start at the same time. After Phase 5, phases 6 and 7 can run in parallel.

## Not in this plan (later)

- Reviewing in Russian or English from the UI. The API takes `language`; the screen will always send `uz` for now.
- A review that streams its findings live, instead of waiting for the whole result.
- Editing the contract by hand on the screen.
