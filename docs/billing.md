# Billing: plans, payments and teams

**Status (2026-11-21): built.** Test payments only; Payme and Click come later.

## The plans

| | **Bepul** (Free) | **Şaxsiy** (Individual) | **Kompaniya** (Company) |
|---|---|---|---|
| Price per month | 0 | 59 000 söm | 299 000 söm |
| Price per year (−20%) | — | 566 400 söm | 2 870 400 söm |
| AI checks | 3, once (at sign-up) | 20 per month | 150 per month, shared by the team |
| Users | 1 | 1 | 5 included, +49 000 söm/month each extra |
| Sending for signature | 3, once | unlimited | unlimited |

- An **AI check** is one AI review of a document. Corrections in the chat and summaries for signers don't use a check. The automatic re-review after accepting edits does use one, and is skipped when none are left.
- Monthly checks reset on the 1st of each month (UTC). Free checks never reset.
- The source of truth is `packages/contracts/src/billing.ts` (`PLANS`, `planPrice`). The API, the pricing page and this table all read from it, so a price is changed in one place.

## How a customer uses it

1. **Sign up** at `/register` (name, email, password). They are on the free plan with 3 checks and are signed in right away.
2. When the checks run out, the API answers **402** and the web app shows **"Limit tugadi"** with a link to `/pricing`. The sidebar always shows how many checks are left.
3. On **`/pricing`** they pick monthly or yearly, then a plan. For Kompaniya they also pick the number of users and type the company name. A confirmation shows the total; **"tölaş"** records a test payment and the plan starts at once.
4. **`/billing`** shows the plan, the paid-until date, checks and sends used, payment history, and **Bekor qiliş**. Cancelling keeps the plan until the paid date; **Davom ettiriş** undoes it. Company owners change the number of users here; extra users are charged at once.
5. **`/team`** (company): the owner or an admin types a colleague's email and role and gets an **invite link**, which they send themselves, since emails aren't sent yet. The link works once and expires after 7 days. The colleague opens `/invite/<token>`:
   - a new person sets a name and password;
   - someone who already has an account enters their password.

   Either way they join the company and are signed in. Owners and admins can change roles and remove members. A removed member keeps their own account on the free plan.

## Rules

- **Who can pay:** an individual for themselves; in a company, only the **owner** or an **admin**. Members use the company's checks but can't change the plan.
- **Seats:** every member and every open invite takes a seat. An invite fails with **409 `SEATS_FULL`** until seats are added.
- **Buying the same plan again** extends it by one period (from the current end date).
- **Moving from Şaxsiy to Kompaniya** creates the company with the buyer as owner. The company gets its own quota.
- **Nothing renews automatically yet.** With test payments there is nothing to charge. Payme and Click will add renewals.

## API

All routes need sign-in unless marked public.

| Route | What it does |
|---|---|
| `GET /billing/plans` (public) | The plan list |
| `GET /billing/me` | Plan, subscription, checks and sends used, team and seats, `canManage` |
| `GET /billing/payments` | Payment history |
| `POST /billing/checkout` `{plan, interval, seats?, companyName?}` | Test payment; starts or extends the plan |
| `POST /billing/cancel`, `POST /billing/resume` | Stop or restart renewal at the period end |
| `PATCH /billing/seats` `{seats}` | Change company seats (adding is charged at once) |
| `GET /team` | Members, open invites, seats |
| `POST /team/invites` `{email, role}` | Creates an invite; the response has `inviteUrl` |
| `DELETE /team/invites/:id` | Cancels an invite |
| `PATCH /team/members/:id` `{role}`, `DELETE /team/members/:id` | Change a role, remove a member |
| `GET /invites/:token` (public) | Company name, email and inviter, for the invite page |
| `POST /invites/:token/accept` (public) `{password, fullName?}` | Joins the company and signs in (sets the refresh cookie) |
| `POST /auth/register` (public) `{fullName, email, password}` | Sign-up and sign-in; 409 `EMAIL_TAKEN` if the email exists |

**Error codes** (`BILLING_ERROR_CODES`):
- `REVIEW_LIMIT_REACHED` (402)
- `SEND_LIMIT_REACHED` (402)
- `SEATS_FULL` (409)
- `NOT_MANAGER` (403)
- `EMAIL_TAKEN` (409)
- `INVITE_INVALID` (404)
- `ALREADY_IN_TEAM` (409)

## Tables (migration `0007_billing`)

- **`subscriptions`:** one row per account, keyed by `scope_key`, which is `user:<id>` or `agency:<id>` (the same key `ai_usage` uses). Stores the plan, `interval`, `seats`, `current_period_end` and `cancel_at_period_end`. If there's no row, or the period has ended, the account is on the free plan.
- **`payments`:** every charge, with provider `test|payme|click`, the amount in söm, the status and a description.
- **`agency_invites`:** email, role and the token's **sha256** (the token itself is never stored), plus expiry, accepted and revoked times.

## Code

- `apps/api/src/billing/`:
  - `plan-of.ts`: the active subscription and how much is used against the plan.
  - `billing.service.ts`: checkout, cancel, seats and payments.
  - `team.service.ts`: members and invites.
  - `billing.controller.ts`.
- Limits are enforced in `apps/api/src/usage/ai-usage.service.ts`:
  - `assertReviewAllowed` runs when a review is queued;
  - `assertSendAllowed` runs on `POST /signature-requests/:id/send`.
- Web:
  - `apps/web/src/lib/billing.ts`: the API calls, `showUpgrade()` and `formatSom`.
  - `components/billing/`: `UsageMeter`, `UpgradeDialog` and `AuthCard`.
  - Pages: `(app)/pricing|billing|team` and `(public)/register|invite/[token]`.
- Tests: `apps/api/test/billing.spec.ts`.

## Later

- **Payme / Click:** replace the test charge with a redirect plus webhook, and add renewals and failed-payment handling.
- Send invite emails, once email delivery exists.
- Invoices and receipts (PDF), and VAT if the legal entity needs it.
