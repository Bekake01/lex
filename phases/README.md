# Phases (temporary)

The signing work from `docs/SIGNING-PLAN.md`, split into steps you can do one at a time.
Delete this folder when the last phase is done (the plan doc stays).

Tech award repo, referred to below as `TA/`: `/Users/bek/lex/President-tech-award-e-signsoft`.

| # | Phase | Needs | Area |
|---|---|---|---|
| 01 ✅ | [Contracts and mocks](01-contracts-and-mocks.md) | — | packages/contracts |
| 02 ✅ | [Database](02-database.md) | 01 | api |
| 03 ✅ | [R2 storage](03-r2-storage.md) | — | api |
| 04 ✅ | [Crypto, stamping, certificate](04-crypto-stamp-seal.md) | 01 | packages/crypto |
| 05 ✅ | [Sender API](05-api-sender.md) | 02, 03 | api |
| 06 ✅ | [Public signing API](06-api-public-signing.md) | 05 | api |
| 07 ✅ | [Jobs: completion, invite, summary](07-jobs.md) | 04, 06 | api |
| 08 ✅ | [Web: field editor](08-web-editor.md) | 01 (mocks) / 05 | apps/web |
| 09 ✅ | [Web: people, send, detail, lists](09-web-send-and-detail.md) | 08 | apps/web |
| 10 ✅ | [Sign app](10-sign-app.md) | 01 (mocks) / 06 | apps/sign |
| 11 | [End-to-end demo and cleanup](11-end-to-end.md) | all | all |

03 and 04 can run in parallel with 02. 08–10 can start on mocks right after 01.

Every phase ends the same way:
1. Check only what the phase lists under **Check** (no full test runs on every edit — see `CLAUDE.md`).
2. Update `memory/CHANGELOG.md` (top) and `memory/STATE.md` in the same commit.
3. Tick the phase in this table (add ✅).
