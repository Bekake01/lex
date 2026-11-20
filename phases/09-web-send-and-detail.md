# Phase 09 — Web: people, send, detail, lists

**Goal:** steps 2 and 3 of the send flow, the result screen with links, the send detail page, and the
Hujjatlar lists on real data.

## Copy from tech award (reference)
- `TA/apps/web/app/prepare/[id]/setup-step.tsx`, `send-review.tsx`, `recipients.ts` — layout ideas only;
  our people step is different (channels, no roles, no order).
- `TA/apps/web/app/(app)/requests/[id]/page.tsx` + `packet-actions.tsx` — detail page structure.

## Steps
1. **Step 2 — Odamlar** (`components/send/PeopleStep.tsx`)
   - Rows: Ism (optional) · Kanal (Email / Telegram / SMS / Faqat havola, small segmented control with icons)
     · Kontakt (placeholder by channel: `ism@pochta.uz`, `+998 90 123 45 67`, `@username`; hidden for
     "Faqat havola") · remove.
   - "+ Odam qöşiş", and **"Röyxatni qöyiş"**: a textarea, one person per line (`Ism, kontakt` or just a
     contact); the channel is guessed (`@` → email or telegram, digits → SMS).
   - Inline errors from the phase 01 refines; max 500.
   - Autosave → `PATCH /signature-requests/:id { recipients }`.
2. **Step 3 — Yuboriş** (`components/send/SendStep.tsx`)
   - Sarlavha (title), Xabar (message to signers), Qaysi tomon (partyName, free text with suggestions from
     `GET /documents/:id/parties` if a review exists).
   - **Havola sozlamalari**: toggle **Ochiq havola** (off) and toggle **Parol bilan himoyalaş** (off → password
     field + note "Parolni alohida yuboring") → `PATCH /signature-requests/:id/access`.
   - Summary: "1 hujjat · 5 maydon · 12 odam · ochiq havola yöq · parolsiz".
   - **Yuboriş** → `POST /signature-requests/:id/send` → result screen.
3. **Result screen** — one row per person: name, channel icon, contact, link + **Nusxa** (copy) and a share
   button by channel:
   - Telegram → `https://t.me/share/url?url=<link>&text=<message>`
   - SMS → `sms:<phone>?body=<message> <link>`
   - Email → `mailto:<email>?subject=<title>&body=<message> <link>`
   - Faqat havola → copy only.
   Plus the open link (if on) with copy / share, and a "Hammasini nusxalaş" (all links as text).
   Then "Hujjatga ötiş" → detail page.
4. **Detail page** `/(app)/documents/sends/[id]`
   - Header: title, sent date, progress "12 / 40 imzoladi" (bar), status chip, actions: **Odam qöşiş**
     (same row editor as step 2 → `POST …/recipients`, then shows their links), **Havola sozlamalari**
     (same toggles), **Bekor qiliş** (confirm in our own dialog, not `window.confirm`).
   - Table: name / signer name, channel + contact, source ("Ochiq havola" badge), status
     (Yuborildi / Ochdi / Imzoladi), signed at, actions: copy link, share, **Imzolangan nusxa** and
     **Sertifikat** downloads (disabled with a spinner until `ready`), "Qiymatlar" (popover with the field
     values).
   - Filter chips: Hammasi / Imzolagan / Kutilmoqda. Poll the detail every 5 s while anyone is signed-but-not-ready.
5. **Hujjatlar lists** (`components/Documents.tsx`)
   - Imzolaş → "Imzolaşim kerak" = `GET /signature-requests?box=inbox` (rows open the person's own `signUrl`).
   - Imzolaş → "Javob kutilmoqda" / "Imzolangan" = `box=sent`, split by `signedCount < recipientCount`;
     row text "12 / 40 imzoladi"; drafts show "Qoralama" and open the editor.
   - Mening hujjatlarim = `GET /documents` (needs the list route if it isn't there yet — add it in this phase,
     owner's latest versions only).
   - Remove the demo arrays these lists used from `lib/demo.ts` (keep what other pages still use).
6. Downloads use the bearer token: fetch → blob → object URL → click (a plain `<a href>` has no auth header).

## Check
- By hand, against the API: draft → fields → 3 people (email / telegram / link) + open link + password → send →
  copy links → (after phase 10) sign one → detail shows it signed and both downloads work.

## memory/
- CHANGELOG: send flow + detail page + Hujjatlar on real data; routes the web now uses. STATE: frontend line,
  remove "demo data" where it's no longer true.
