# Phase 04 — Crypto, stamping, certificate

**Goal:** pure functions (no Nest, no DB) that turn *original PDF + fields + values + signature PNG* into a
signed PDF, seal its hash, and render a certificate — with Uzbek letters printing correctly.

## Copy from tech award
| From `TA/` | To lex |
|---|---|
| `packages/crypto/src/seal.ts` (`SealService`, `parseSealRing`) | `packages/crypto/src/seal.ts` |
| `packages/crypto/src/tokens.ts` | `packages/crypto/src/tokens.ts` (only if useful; lex tokens are plain `randomBytes(32)`) |
| `packages/crypto/src/png-bytes.ts` | `packages/crypto/src/png-bytes.ts` (checks the signature image really is a PNG) |
| `packages/crypto/src/certificate.ts` | merge into the existing `packages/crypto/src/certificate.ts` |
| `apps/api/src/modules/signing/stamp-pdf.ts` | `apps/api/src/signing/stamp-pdf.ts` (or crypto, if web needs it — it doesn't) |
| `apps/api/src/modules/templates/pdf-geometry.ts` | `apps/api/src/signing/pdf-geometry.ts` (page count + sizes) |
| `apps/api/src/modules/signing/field-values.ts` | `apps/api/src/signing/field-values.ts` |
| the matching `*.spec.ts` files | next to them |

## Steps
1. Deps: `pnpm --filter @lex/crypto add pdf-lib @pdf-lib/fontkit`; `pnpm --filter api add pdf-lib @pdf-lib/fontkit`.
2. **Font:** add `NotoSans-Regular.ttf` and `NotoSans-Bold.ttf` (OFL licence, from the Noto fonts GitHub
   releases) to `packages/crypto/fonts/`, plus the licence file. Export a `loadFonts()` helper that reads them
   once. In `stampPdf` and the certificate: `pdf.registerFontkit(fontkit)`, then
   `pdf.embedFont(bytes, { subset: true })` instead of `StandardFonts.Helvetica`. Drop `toPdfSafeText`'s
   WinAnsi replacement (keep stripping control characters).
3. `stampPdf`: keep `toPdfBox` and the rotation / MediaBox handling exactly as in tech award (that is the
   tricky part). Input `{ pdfBytes, fields, fieldValues, signaturePng }`; images go into
   `signature | initial | stamp`, checkbox draws a ✓, everything else draws text fitted to the box.
4. `field-values.ts`: remove `recipientKey` filtering. `date` (date signed) is still server-filled
   (`YYYY-MM-DD` at submit). Everything else comes from the signer and is checked with `fieldValueProblem`;
   required fields must be present; dropdown/radio values must be one of `options`.
5. `seal.ts`: seal payload for lex = canonical JSON of
   `{ requestId, recipientId, signedAt, signedHash, documentHash, summaryHash }` (use `canonicalJson` from
   `@lex/crypto`). Add a `verify` that the detail page can call later.
6. Certificate (one signer per certificate), in Uzbek: document title, sender (name + email), send id,
   signer (typed name, channel + contact, source invite / open link), viewed / consented / signed times,
   IP + user agent, original document sha256, signed copy sha256, "Summary shown to signer: sha256 …"
   (already in lex crypto), seal key id + signature.
7. Add a dev script to make a seal key ring (`pnpm --filter api seal:keygen` printing the JSON for
   `SEAL_KEYS`); same ring format as tech award's `ESIGN_SEAL_KEYS`.

## Check
- Run only the ported specs: `toPdfBox` / rotation, field values, seal sign + verify, PNG check.
- One manual run: stamp a real 2-page PDF with the name "Şoira Ğulomova Oʻktamovna" and open it — letters
  must render, boxes must sit where the fields were.

## memory/
- CHANGELOG: `@lex/crypto` gains seal, stamping font, certificate; new env `SEAL_KEYS` (+ keygen script).
