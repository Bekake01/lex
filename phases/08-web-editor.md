# Phase 08 — Web: field editor

**Goal:** from Hujjatlar the user picks or uploads a PDF, lands in the editor, and places fields on the pages.
Saves to the draft. Works on mocks first, then on the phase 05 API.

## Copy from tech award
| From `TA/apps/web/` | To `apps/web/src/` |
|---|---|
| `lib/use-pdf.ts` | `lib/use-pdf.ts` (pdf.js loader + worker setup) |
| `app/prepare/[id]/pdf-page.tsx` | `components/send/PdfPage.tsx` (renders a page + its field boxes) |
| `app/prepare/[id]/editor.tsx` | `components/send/FieldEditor.tsx` (drag / resize / select / undo / zoom) |
| `app/prepare/[id]/field-properties.tsx` | `components/send/FieldProperties.tsx` |
| `lib/field-catalog.tsx` | `lib/field-catalog.tsx` (palette: icon, label, default size per type) |
| `components/pdf/pdf-thumbnail.tsx` | `components/send/PdfThumbnail.tsx` (page strip) |

## Steps
1. `pnpm --filter web add pdfjs-dist` (same major as tech award, `6.x`); set the worker the way `use-pdf.ts` does.
2. Strip from the copied editor: recipient groups / `recipientKey` colors, the routing setup, template
   saving, Clerk, `@docflow/*` imports (→ `@lex/contracts`), lucide icons → our `components/Icons.tsx`
   (add the few missing ones there), `Button` / `IconButton` → our `btn` classes.
3. Restyle with `@lex/theme` tokens only (no hex, no Tailwind palette). One accent color for field boxes;
   signature-type fields slightly stronger.
4. Uzbek Latin labels for the palette: Imzo, Paraf (initial), Muhr (stamp), Sana (imzolangan sana),
   F.I.Ş., Ism, Familiya, Email, Taşkilot, Lavozim, Matn, Raqam, Telefon, Manzil, Belgi (checkbox),
   Röyxat (dropdown), Tanlov (radio), Sana tanlaş (date_input).
5. Route `/(app)/documents/send/[id]` (id = draft id), step 1 of 3 in a small stepper:
   **Maydonlar → Odamlar → Yuboriş**. Load the draft (`GET /signature-requests/:id`) and the PDF
   (`GET /documents/:documentId/file` with the bearer token from `lib/auth.ts`).
6. Autosave: debounce 800 ms → `PATCH /signature-requests/:id { fields }`; show "Saqlandi" / "Saqlanmoqda…".
   "Keyingi" is disabled until there is at least one Imzo field.
7. Entry points:
   - Hujjatlar → "Mening hujjatlarim": a row action **"Imzoga yuboriş"** on PDF files.
   - Hujjatlar header: **"Imzoga yuboriş"** button → pick an existing PDF or upload a new one.
   - Both: `POST /signature-requests { documentId }` → redirect to the editor. A 415 shows
     "Faqat PDF yuboriş mumkin — Word faylni PDF ga aylantirib yuklang (Fayl → PDF sifatida saqlaş)".
8. `lib/upload.ts`: add `SEND_ACCEPT = '.pdf'` and `sendUploadError(file)`; the review upload keeps
   `.pdf,.docx,.txt`.
9. Until phase 05 is merged, read `packages/contracts/mocks/signing-draft.json` and a sample PDF in
   `apps/web/public/demo.pdf` (behind the same demo switch as the rest of `lib/demo.ts`).

## Check
- By hand: place, move, resize, delete, undo a field on a 2-page PDF; zoom; reload → fields are back.
- A rotated / landscape PDF page: boxes stay where you put them (this is what `pdf-page.tsx` already handles —
  don't "simplify" its coordinate code).

## memory/
- CHANGELOG: editor at `/documents/send/[id]`, `pdfjs-dist` added to web. STATE: frontend line.
