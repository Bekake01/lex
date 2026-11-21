# MacBook: what to do next (2026-11-21)

Thanks again! This page covers **today's work**. One-time setup, Docker and the `.env` file are in [`heavy-jobs-mac.md`](heavy-jobs-mac.md) (section 1, Job E, Job F). Read this page from top to bottom; each step says how long it takes.

Run every command from the `lex` folder unless the step says otherwise.

---

## Step 1. Get the new code (about 5 minutes)

```bash
cd ~/path/to/lex
git pull origin z-ai
pnpm install
pnpm --filter @lex/contracts --filter @lex/crypto build
pnpm services:up                     # Postgres 5434 + Redis 6391 (skip if already running)
cd apps/api && pnpm db:migrate && cd ../..
```

`db:migrate` adds the new billing tables (migration `0007_billing`). It should finish without errors.

**Check:**
```bash
cd apps/api && pnpm test && cd ../..
```
It should end with all tests passed. If one fails, send the last 30 lines.

---

## Step 2. Job E, if it isn't done yet (about 2 hours, mostly waiting)

If you already sent back `eval-phase8-keyword.txt` and `eval-phase8-hybrid.txt`, **skip this step.**

Otherwise, follow **Job E** in [`heavy-jobs-mac.md`](heavy-jobs-mac.md) (E1 to E6). In short:

```bash
cd apps/api
pnpm ingest:hf
pnpm ingest:core               # about 6 minutes, must end with "Done: 16 ok, 0 failed"
pnpm ingest:embed --limit 2000
pnpm ingest:embed              # 1–2 hours; run again if it stops
pnpm eval:search --keyword-only --out data/eval-phase8-keyword.json
pnpm eval:search --out data/eval-phase8-hybrid.json
```

**Send back:**
- `data/eval-phase8-keyword.txt`
- `data/eval-phase8-hybrid.txt`
- the last line printed by `pnpm ingest:embed`

These reports are what the law track is waiting for.

---

## Step 3. Start the app (about 2 minutes)

`apps/api/.env` needs `OPENAI_API_KEY` for AI reviews (see Job F1 in `heavy-jobs-mac.md`). Then open three Terminal tabs in the `lex` folder:

```bash
pnpm dev:api      # backend   → http://localhost:5000
pnpm dev:web      # dashboard → http://localhost:3000
pnpm dev:sign     # signing   → http://localhost:3001
```

Check that http://localhost:5000/health shows `"db": true`.

Once, in `apps/api`, create the demo data:

```bash
pnpm db:seed      # team accounts (password = the email part before "@")
pnpm seed:demo    # demo@lex.local / demo, with one finished review
```

---

## Step 4. Try the new features (about 30 minutes)

Use **Chrome** at http://localhost:3000. Write down anything that looks wrong: the step number, what you did, what you saw, and a screenshot if possible.

> Each new AI review uses one check and costs a little OpenAI money (a few cents). The tests below need about 5 reviews.

### 4A. Sign-up and the free plan

1. Open http://localhost:3000/register and create an account with your own test email and a password of 8 or more characters.
   - ✅ You land in the app, signed in.
   - ✅ Bottom left of the sidebar: **"Bepul tarif · 3 / 3 bepul"**.
2. Sign out (click your name at the bottom left, then **Çiqiş**), and sign in again with the same email and password.
   - ✅ It works.
3. Try registering the same email again.
   - ✅ It says the email already has an account.

### 4B. A real AI review

You need a contract file. A **Word (.docx)** rental or employment contract in Uzbek is best; a PDF also works.

1. On the home page, click **"Hujjat yuklaş"** under the question box and pick the file.
   - ✅ The page changes to `/review?doc=…`.
   - ✅ It shows three steps with a spinner and the note "Odatda 20–60 soniya".
2. Wait.
   - ✅ After about 20–60 seconds you see the result: a risk badge, a verdict, a short summary, then the problems found. Each problem has a severity, the quoted contract text, a recommendation, and a law link that opens **lex.uz**.
   - Write down how long it took.
3. Reload the page (Cmd+R).
   - ✅ The same result appears quickly.
   - ✅ The sidebar counter went down by **one**, not two.
4. Go to **Hujjatlar → Mening hujjatlarim** and click the file.
   - ✅ The same review opens.
5. Upload a file that isn't a contract, for example a photo renamed to `.pdf`.
   - ✅ You see an error message in Uzbek, not a crash.

**Please also tell us:** do the problems the AI found make sense for that contract? Is anything clearly wrong, or is an important problem missing?

### 4C. Running out of free checks

1. With the same account, upload and review two more documents. That is 3 reviews in total.
   - ✅ The sidebar shows **0 / 3**.
2. Upload a fourth document.
   - ✅ A **"Limit tugadi"** dialog opens, and the page says the checks are used up, with a **"Tariflarni köriş"** button.

### 4D. Paying (test mode) and the plans

1. Click **"Tariflarni köriş"** or open http://localhost:3000/pricing.
   - ✅ Three plans: Bepul, Şaxsiy (59 000 söm/oy), Kompaniya (299 000 söm/oy).
   - ✅ The **Oylik / Yillik** switch changes the prices: yearly is 20% cheaper.
2. Click **"Şaxsiy tarifini tanlaş"**.
   - ✅ A payment window shows **Payme** and **Click** buttons marked "Tez orada". Clicking them only shows a "coming soon" message; they don't work yet, and that's expected.
   - Click **"Test tölov · 59 000 söm"**.
   - ✅ You land on **/billing**, with "Tölov qabul qilindi", plan **Şaxsiy**, checks **x / 20**, and one row in the payment history.
3. Upload and review a document again.
   - ✅ It works now (no limit dialog).
4. On /billing click **"Bekor qiliş"** and confirm.
   - ✅ It says the plan ends on a date.
   - Click **"Davom ettiriş"**: ✅ it's back to normal.

### 4E. Company plan and team invites

You need **two browsers**, for example Chrome and Safari (or a Chrome incognito window).

1. In Chrome, register a **new** account (4A), go to /pricing and choose **Kompaniya**. Type a company name, for example "Test Huquq", and pay with the test button.
   - ✅ /billing shows plan **Kompaniya**, the company name, **Egasi** (owner), and checks **0 / 150**.
2. Open **Jamoa** in the sidebar (`/team`). Type another test email, choose the role **Aʼzo**, and click **"Havola yaratiş"**.
   - ✅ A link appears with a **Nusxalaş** (copy) button.
   - ✅ The invite shows under "Kutilayotgan takliflar".
3. Copy the link and open it in **Safari** (signed out).
   - ✅ It shows "Test Huquq jamoasiga qöşiling" with the email filled in.
   - Enter a name and a password, then click **"Jamoaga qöşiliş"**.
   - ✅ You're signed in on the team page.
4. In Safari, review a document.
   - ✅ In Chrome, /billing counts it in the company's checks (1 / 150).
5. Open the same invite link again.
   - ✅ It says the link was already used ("Havola eskirgan").
6. In Chrome on /team, change the new member's role to **Admin**, then remove them.
   - ✅ Both work, and the member disappears from the list.
7. On /billing, increase the number of users to 6 and pay.
   - ✅ A new payment of 49 000 söm appears in the history.

### 4F. Sending for signature (already built before; a quick check)

1. **Hujjatlar → Imzoga yuboriş**: pick a **PDF**, add a signature field, add a person with "Faqat havola", and send.
   - ✅ You get a link.
2. Open the link in Safari and sign.
   - ✅ The signed copy downloads.
3. With a **free** account that has already sent 3 documents, a fourth send shows the "Limit tugadi" dialog.

---

## Step 5. Send the results back

Send these in chat:

1. The two `eval-phase8-*.txt` files and the last `ingest:embed` line, from Step 2 (if you did it).
2. Your notes from Step 4: what worked ✅, what didn't ❌ (step number, message, screenshot), and how long reviews took.
3. Your opinion of the AI review quality (4B).

**Never send the `.env` file or any API key.**

---

## Stopping

Press Ctrl+C in each Terminal tab, then run `docker compose stop`. This keeps all data, including the paid-for embeddings. **Don't** run `docker compose down -v`: it deletes the database.

## Common problems

| What you see | Fix |
|---|---|
| `Cannot find module '@lex/contracts'`, or the pricing page is blank | `pnpm --filter @lex/contracts --filter @lex/crypto build`, then restart `pnpm dev:web` and `pnpm dev:api` |
| `relation "subscriptions" does not exist` | `cd apps/api && pnpm db:migrate` |
| The review fails with "AI hali sozlanmagan" | `OPENAI_API_KEY` is missing in `apps/api/.env`; add it and restart `pnpm dev:api` |
| The review waits forever | Is Redis running (`pnpm services:up`)? Look at the `dev:api` tab for errors and send them |
| Can't connect to the database | `pnpm services:up`, wait 10 seconds, try again |
