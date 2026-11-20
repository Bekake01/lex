# Phase 07 — Jobs: completion, invite, summary

**Goal:** every submission becomes a sealed signed PDF + certificate in storage; invites log per channel;
the AI summary is one per send.

## Copy from tech award
- `TA/apps/api/src/modules/signing/completion.ts` — the order of steps and the idempotency check.
  Drop tenant, email, multi-signer logic.

## Steps
1. **Queue constants** (`src/queue/queue.constants.ts`): add `QUEUE.completeSubmission = 'complete-submission'`,
   `CompleteSubmissionJob = { recipientId }`, `jobIdForComplete = (id) => \`complete.${id}\`` (`.` not `:`).
   Register the queue in `queue.module.ts`.
2. **`signing/jobs/complete-submission.processor.ts`**
   1. Load recipient + request + document + summary hash. Not signed → return. `signedPdfKey` and
      `certificateKey` both set → return (idempotent).
   2. Original bytes from `StorageService`; signature PNG from `signatureImageKey`.
   3. `stampPdf` → `signedHash = sha256(bytes)` → `SealService.seal(...)` (phase 04 payload) →
      `buildCertificatePdf(...)`.
   4. `put` both files (`signed/…`, `certificates/…`), then **one** update writing `signedPdfKey`,
      `certificateKey`, `signedHash`, `sealSignature`, `sealKid`.
   5. Errors throw → BullMQ retries (attempts 5, exponential backoff).
3. Phase 06 `submit` now enqueues it with `jobIdForComplete(recipientId)`. If the enqueue fails, log and still
   return ok; a small sweep on API start re-enqueues signed rows with no `signedPdfKey` (one query, no cron).
4. **`send-signing-invite`**: keep the "wait for the summary until `summaryDeadline`" logic. Log one line per
   recipient with channel + contact + link (debug level for the link). Skip `source = 'open_link'` rows.
   Take an optional `recipientIds` in the job so phase 05 step 6 (add people) can reuse it. Real delivery
   stays "Later".
5. **`summarize-for-recipients`** (AI track — coordinate with zuhriddin):
   - one model call per send, using `request.partyName` (fallback: the AI review's other party, else generic
     "imzolovçi");
   - write **one** `recipient_summaries` row (`recipientId` null, unique on `signatureRequestId`), set
     `signature_requests.summaryHash`;
   - idempotent as now (`summariesStatus === 'done'` → return). No prompt change → no `AI_PROMPT_VERSION` bump;
     if the prompt does change, bump it and run `pnpm eval:review`.
6. Update `test/summaries-and-signing.spec.ts` for the one-summary-per-send shape.

## Check
- Submit a signature (phase 06 test or curl) → within a few seconds `GET /sign/:token/status` says
  `ready: true`; download both files; the signed PDF shows the values in the right boxes; the certificate shows
  both hashes and Uzbek letters.
- Run the job twice for the same recipient → still one set of files, same hash.

## memory/
- CHANGELOG: new job `complete-submission`; summary is one per send (AI track note). STATE: signing works end to
  end in the API.
