# Phase 03 — R2 storage

**Goal:** `StorageService` can store bytes on Cloudflare R2; local disk stays the default so tests and
teammates without keys keep working. Nothing outside `src/storage/` changes.

## Copy from tech award
- `TA/apps/api/src/storage/storage.service.ts` (S3 client against R2: `PutObjectCommand`,
  `GetObjectCommand`, `DeleteObjectCommand`). Drop the tenant prefix logic.

## Steps
1. `pnpm --filter api add @aws-sdk/client-s3`.
2. `src/config/env.ts`: add
   - `STORAGE_DRIVER: z.enum(['local', 'r2']).default('local')`
   - `S3_ENDPOINT` (no path, no bucket in it: `https://<account-id>.r2.cloudflarestorage.com`; our bucket `lexdoc` is in the default jurisdiction — an EU bucket would need `.eu.` in the host), `S3_REGION` (default `auto`),
     `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — optional, but a `superRefine` makes all four
     required when the driver is `r2` (boot fails naming the missing keys).
3. `src/storage/`: split into two small drivers with the same methods the app already uses
   (`put(key, bytes, contentType?)`, `get(key)`, `delete(key)`):
   - `local-storage.driver.ts` — the current disk code, unchanged (keep the `pathFor` escape check).
   - `r2-storage.driver.ts` — S3 client with `forcePathStyle: true`; `get` reads the body to a `Uint8Array`.
   - `StorageService` picks one in the constructor from `STORAGE_DRIVER` and delegates. `buildKey` stays.
4. Keys used from phase 05 on (document them in the service's comment):
   `documents/<documentId>/<file>`, `signatures/<requestId>/<recipientId>.png`,
   `signed/<requestId>/<recipientId>.pdf`, `certificates/<requestId>/<recipientId>.pdf`.
5. Add the new vars (empty) to `apps/api/.env.example` with a one-line comment each.
6. Bucket is **private**; bytes always go through the API, never a public URL.

## Check
- `storage.service.spec.ts` still passes (local driver).
- With R2 keys in `.env`: start the API with `STORAGE_DRIVER=r2`, upload a document via `POST /documents`,
  see the object in the R2 dashboard, open it via the API.

## memory/
- CHANGELOG: new env vars `STORAGE_DRIVER`, `S3_*`; local stays default. STATE: decision line "Document bytes on
  local disk…" → "local disk or R2 (`STORAGE_DRIVER`)".
