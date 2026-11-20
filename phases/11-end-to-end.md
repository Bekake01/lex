# Phase 11 — End-to-end demo and cleanup

**Goal:** the whole flow works from a clean checkout for the demo, the seed shows it, docs and memory are true,
and the temporary pieces are gone.

## Steps
1. **Seed** (`apps/api/src/dev/seed-demo.ts`, `pnpm seed:demo`): replace the old one-recipient request with
   a sent signing request on a real sample PDF (put it in `apps/api/scripts/fixtures/`), fields on it,
   4 people (email / telegram / sms / link), open link on, no password; one person already signed and sealed
   (run the completion code directly). Print the sender login, the send detail URL, every sign link and the
   open link.
2. **Full run** with `pnpm services:up`, `pnpm db:migrate`, `pnpm seed:demo`, all three apps:
   sender: upload PDF → fields → people → open link + password → send → copy links;
   signer (phone-size window): password → summary → fill → sign → download;
   open link: start → sign; sender: detail shows both, downloads work, cancel kills the links.
   Once with `STORAGE_DRIVER=local`, once with `r2`.
3. **Tests** — now run the whole API suite once (`pnpm --filter api test` and e2e) and fix what the new model
   broke (`summaries-and-signing.spec.ts`, `seed-demo.spec.ts`, `contract-mocks.spec.ts`).
4. **Docs**
   - `docs/SIGNING-PLAN.md`: status → "built", note anything that ended up different.
   - `docs/ai-frontend-handoff.md`: signing summary section → one summary per send.
   - `README.md`: new env vars, `seal:keygen`.
   - `ROADMAP.md`: tick what is done; "Later" items stay.
5. **memory/**: STATE "Works now" describes the signing flow; remove the "In progress" signing lines;
   CHANGELOG entry "signing flow done".
6. Delete the `phases/` folder.
