# AI Legal Review & E-Signature SaaS — Product Roadmap

> Status: planning · Written 2026-11-20 · Builds on the existing **adss-saas (DocFlow / E-SIGNSOFT)** codebase

> **⚠️ Important rule — this is a hackathon. Build a working MVP, keep it simple.**
> - **No RLS and no row-level / tenant isolation at all.** No `ENABLE`/`FORCE` RLS, no `tenant_isolation` policies, no `rls.spec.ts`.
> - Store users and agencies as plain tables; a simple `userId` / `agencyId` column is enough.
> - No detailed or enterprise-grade layers for now. Working end-to-end flow first; hardening comes after the hackathon.

---

## 1. Vision

A Claude-style SaaS where a sender uploads a contract, **AI checks it against Uzbek legislation**, proposes corrections on request, and sends it for signature. The receiver opens a **signing link** (it can be opened any number of times, but the signature can be completed only once; after signing, the link closes), reads a plain-language **summary of the contract and of their own obligations**, signs, and both parties get a **sealed, verifiable signed document**.

**What makes it different**

1. Legal review grounded in **lex.uz** law, with every finding citing a real article.
2. The receiver understands what they sign: their obligations, the other party's obligations, and the key conditions.
3. Proof: SHA-256 + Ed25519 seal + Certificate of Completion + public verification (later E-IMZO).

---

## 2. Users

| Type | Tenant kind | Needs |
|---|---|---|
| **Individual** | `personal` | Check a single contract, fix it, send it, sign. Simple and cheap. |
| **Agency** (law firm, realtor, HR, notary office) | `company` | Team members with roles, shared templates, many sends, pooled AI quota, branding, reports. |
| **Receiver** | none (token) | Opens the link, understands the contract, signs. No account needed. (Later, if time allows: sync to their account if they already use the platform.) |
| **Verifier** | public | Uploads a signed file and checks it was not altered. |

---

## 3. End-to-end flow

```
SENDER (apps/web)                 API + WORKER (apps/api)                     RECEIVER (apps/sign)
─────────────────                 ───────────────────────                     ────────────────────
1 Upload PDF/DOCX ──────────────► Document v1 (R2, sha256)
2 Check legality ───────────────► job analyze-document
                                    extract → classify → law-search → LLM (OpenAI)
  ◄── risk, issues, lex.uz cites ── AiReview
3 Chat: "fix clause 4" ─────────► job revise-document
                                    structured edits → validate → apply
  ◄── diff v1→v2, re-check ──────── Document v2 (new sha256)
4 Approve, map parties→recipients,
  Send ─────────────────────────► job summarize-for-recipients (snapshot)
                                    job send-signing-invite (existing)
                                                                     ───────► 5 Signing link (reusable until signed)
                                  GET /sign/:token/summary (precomputed) ◄─── reads summary + obligations
                                                                     ◄─────── 6 consent → sign
                                  job complete-signature (existing)
                                    stamp → hash → seal → certificate
  ◄── signed PDF + certificate ──── email both parties ──────────────────────► 7 signed copy
8 Anyone: /verify ──────────────► hash lookup → seal valid ✔
```

---

## 4. Architecture

### 4.1 Applications (existing monorepo)

| Package | Port | Role | Change |
|---|---|---|---|
| `apps/api` | 5000 | NestJS, stateless HTTP; `worker.ts` = BullMQ worker | **+ ai-review, law-search, law-index slices and jobs** |
| `apps/web` | 3000 | Next.js sender dashboard (Clerk, BFF proxy) | **+ Claude-style review/chat screen, versions, party mapping** |
| `apps/sign` | 3001 | Public signing app with no credentials | **+ summary/obligations step before consent** |
| `packages/contracts` | — | Zod schemas (trust boundary) | **+ review, issue, edit, summary schemas** |
| `packages/crypto` | — | seal, tokens, certificate | + summary hash in certificate |
| `apps/api/src/db` | — | Drizzle ORM schema + migrations, Postgres in Docker (no RLS for the MVP) | **+ AI and law tables** |

**Infra:** Postgres (+ **pgvector**), Redis (BullMQ, rate limits), R2/S3 (file bytes), Clerk, Resend, **OpenAI API**, **embedding provider**.

### 4.2 AI pipeline

| Step | What | Tool |
|---|---|---|
| Extract | PDF goes to the model as a file input; DOCX text extracted with `mammoth` | api worker |
| Classify | Document type, language, parties, clauses, search queries in Uzbek Latin | OpenAI model, structured output |
| Retrieve | Hybrid keyword (Postgres FTS) + vector (pgvector) search; anchor codes per document type; filter to laws in force | `law-search` |
| Review | Risk level, verdict, issues; **each issue cites a retrieved article ID** | OpenAI `gpt-5` (`AI_MODEL`), reasoning effort `high`, structured output |
| Validate | Server drops citations not in the retrieved set; attaches lex.uz URL + law version date | api |
| Revise | Chat instruction → structured edits `{clauseId, original, replacement, reason, citation}` → `original` checked against the document → new version | OpenAI model + docx editor |
| Summarize | At send time: summary, obligations per party, conditions, in uz/ru/en | OpenAI model |

**Model settings:** OpenAI Responses API, `AI_MODEL` (default `gpt-5`), `reasoning.effort: "high"`, strict JSON Schema from the Zod schemas and Zod validation of every answer, refusals and `incomplete` responses handled, `store: false`, automatic prompt caching (instructions first, `prompt_cache_key` per call type).

### 4.3 Law data sources

| Source | Use | Notes |
|---|---|---|
| HF `sukhrobnurali/uzbek-legal-corpus` | Initial index | 54k articles / 24k acts, Uzbek Latin only, mid-2026 snapshot, `status` is a best guess, about half of lex.uz acts missing, Apache-2.0 |
| HF `uzbek-legal-corpus-v1` | Russian/Cyrillic for the main codes | 20 codes + Constitution |
| lex.uz RSS (`/uz/rss`) | Daily updates | No public API; low request rate, attribution; request official access |
| lex.uz document pages | Status check for anchor codes, links in results | `lex.uz/uz/docs/{id}` |

Text handling: one form for `oʻ / o' / o‘` and `gʻ`, Cyrillic→Latin conversion, articles longer than about 1,500 tokens split into parts, flat acts split by paragraph.

### 4.4 New database tables

**App tables (plain tables, no RLS — hackathon MVP):**
- `document_versions` (or `Document.parentDocumentId`, `version`)
- `ai_reviews` (documentId, status, riskLevel, verdict, lawVersionDate, promptVersion, model, tokens, cost)
- `ai_issues` (reviewId, clauseRef, quote, problem, severity, recommendation, articleId)
- `ai_review_messages` (the correction chat)
- `ai_edits` (messageId, original, replacement, reason, articleId, status)
- `recipient_summaries` (signatureRequestId, recipientId, partyName, language, summary JSON, summaryHash)
- `ai_usage` (per user/agency metering for plan limits)

**Law reference data (shared by everyone):**
- `law_acts` (docId, title, type, status, docDate, versionDate, sourceUrl)
- `law_articles` (id, docId, articleNumber, chapter, text, `embedding vector`, `tsv tsvector`)
- `law_sync_runs`

### 4.5 Non-negotiables (from adss-saas CLAUDE.md, applied to AI)

1. **The signing app never calls AI.** Summaries are precomputed at send time, and `/sign/:token/summary` keeps the uniform 404.
2. **Snapshot, don't reference.** The receiver sees exactly the sent version; `summaryHash` is stored next to `documentHash`.
3. **Never modify the original.** Every accepted edit creates a new version with a new sha256.
4. **The mapper is the filter.** Review and summary responses are built field by field; raw prompts and model output never reach the client.
5. **Document text is untrusted.** The prompt treats it as data; edits are validated before they are applied.
6. **Nothing heavy on the request path.** All AI work runs as idempotent BullMQ jobs.
7. **Secrets:** `ANTHROPIC_API_KEY` is added only in `config/env.ts` and redacted in pino logs.

---

## 5. Roadmap

Durations assume 1–2 developers. Phases 0–3 are the **MVP**.

### Phase 0 — Foundations (1 week)
- [ ] Decide on corrected-document format, embedding model, lex.uz data access, and data localization
- [ ] Add pgvector to Postgres; Anthropic + embedding keys in `config/env.ts`
- [ ] `packages/contracts`: review / issue / edit / summary Zod schemas
- [ ] Build an **evaluation set**: 30–50 real Uzbek contracts (rental, employment, sale, services, NDA) with lawyer-marked issues

**Done when:** schemas merged, env validated at boot, eval set ready.

### Phase 1 — Law index (2 weeks)
- [ ] Import the HF Parquet into `law_acts` / `law_articles` (one-off script)
- [ ] Normalization (apostrophes, Cyrillic→Latin), chunking, embeddings
- [ ] `law-search` slice: hybrid search, re-ranking, filters (in force, document-type priority)
- [ ] Anchor code sets per document type (Civil, Labor, Tax codes, consumer protection law…)
- [ ] Check the status of anchor codes against lex.uz once
- [ ] Search quality test: 100 queries, measure recall@10

**Done when:** recall@10 ≥ 0.8 on the query set.

### Phase 2 — AI legal review (3 weeks)
- [ ] `ai-review` slice + `analyze-document` job (extract → classify → retrieve → review → validate)
- [ ] `ai_reviews` / `ai_issues` tables
- [ ] Citation check in code; "no supporting norm found" when retrieval finds nothing
- [ ] `apps/web`: review screen (document left, risk + issues right, click an issue to see its clause and the lex.uz article)
- [ ] Streaming progress state; refusal and failure handling
- [ ] Run the eval set: precision of issues, citation accuracy

**Done when:** citation accuracy ≥ 95% and issue precision ≥ 80% on the eval set.

### Phase 3 — Receiver summary (2 weeks)
- [x] Extract parties; party → recipient mapping on the send screen (one party per send, AI-review suggestions)
- [x] `summarize-for-recipients` job at send time (uz/ru/en) — one summary per send
- [x] `recipient_summaries` table + `summaryHash`
- [x] `GET /sign/:token/summary` reachable from the sign app (pass-through, uniform 404)
- [x] `apps/sign`: summary, your obligations, other party's obligations, key conditions → consent → sign
- [x] Certificate of Completion records the summary hash shown to the signer (one sealed copy + certificate per person)

**Done when:** a receiver can read their obligations and sign; the certificate proves which summary they saw. **→ MVP launch (closed beta).**

### Phase 4 — AI corrections (3 weeks)
- [ ] Claude-style chat panel in `apps/web` (streaming via the BFF)
- [ ] `revise-document` job → structured edits → validation
- [ ] DOCX: apply edits in the Word XML, keeping formatting
- [ ] PDF: corrections list + regenerated document (or conversion to DOCX)
- [ ] Versioning UI: v1 → v2 diff, Accept/Reject per edit, automatic re-check
- [ ] Optional rule: block sending while high-severity issues remain

**Done when:** a sender can fix a contract in chat and send v2 with v1 kept as evidence.

### Phase 5 — Individual vs agency & billing (2–3 weeks; matches adss-saas M2)
- [ ] Plan limits: AI reviews per month (individual) / pooled quota (agency), `ai_usage` metering
- [ ] Agency: member roles (owner/admin/member), shared templates with pre-reviewed clauses, team reports
- [ ] Local payment provider (Payme / Click / Uzum) to replace setting `pro` by hand
- [ ] Usage dashboard: reviews, cost, documents sent, signed

### Phase 6 — Freshness & legal strength (3 weeks)
- [ ] `law-index-sync` daily job from lex.uz RSS (low request rate, idempotent)
- [ ] Show "checked against legislation as of …" on every review
- [ ] Re-review notice when a cited law changes for a document not yet signed
- [ ] **E-IMZO** signing option (national digital signature) for legally stronger signatures
- [ ] Russian / Cyrillic sources added to the index

### Phase 7 — Scale & polish (ongoing)
- [ ] Agentic review: a `search_law` tool so Claude follows cross-references
- [ ] Clause library and AI-generated contract drafts from templates
- [ ] Bulk sends for agencies, workflow automation (adss-saas M3), webhooks / API for integrations
- [ ] Mobile-friendly signing, receiver comments and negotiation rounds
- [ ] Cost tuning: caching, effort per route, batch processing for bulk re-checks

### Later — only if time allows (hackathon stretch, not required)
- [ ] **Receiver sync for registered users:** if the receiver's email/phone matches an existing account on our platform, also show the contract in their inbox and sync its status (opened, signed, sealed copy) there. The signing link keeps working for everyone else.
- [ ] **Sender signs first:** the sender's signature / company stamp is filled once before sending and printed on every copy (see `docs/SIGNING-PLAN.md`).
- [ ] **Real delivery:** Telegram bot, SMS (Eskiz / Playmobile), email via Resend. For now channels are stored and shown, and share buttons open the sender's own apps.
- [ ] **SMS code to confirm the signer** (today: typed name + link + optional password).
- [ ] **Public verify page:** anyone drops a signed PDF and we check its hash + seal.
- [ ] **Export all copies of a send:** CSV of field values, ZIP of signed PDFs.
- [ ] **Open link limits:** max number of submissions, rate limit on password tries for the open link.
- [ ] **Harden the sign app pass-through:** relay secret between sign app and API, edge rate limit, trusted client-IP header behind a CDN.
- [ ] **Server-side Word → PDF** (LibreOffice / Gotenberg), so a DOCX can be sent without converting it by hand.

---

## 6. Timeline overview

| Phase | Weeks | Cumulative |
|---|---|---|
| 0 Foundations | 1 | 1 |
| 1 Law index | 2 | 3 |
| 2 AI legal review | 3 | 6 |
| 3 Receiver summary | 2 | **8 → MVP beta** |
| 4 AI corrections | 3 | 11 |
| 5 Plans & billing | 3 | **14 → public launch** |
| 6 Freshness & E-IMZO | 3 | 17 |
| 7 Scale | ongoing | — |

---

## 7. Cost estimates (Claude Opus 5.5: $4 / $20 per 1M tokens)

| Operation | Approx. tokens | Approx. cost |
|---|---|---|
| Legal review (20-page contract + about 30 retrieved articles) | 60–80k in, 4–8k out | $0.30–0.50 |
| One correction round | 30–50k in, 2–4k out | $0.10–0.20 |
| Summary per recipient | 25–40k in, 1–2k out | $0.05–0.10 |

Prompt caching on the system prompt and checklists lowers repeated input cost. Price plans so that the AI cost is under 20% of revenue per document.

---

## 8. Success metrics

- **Quality:** citation accuracy ≥ 95%, issue precision ≥ 80%, lawyer agreement rate on the eval set
- **Product:** upload → sent conversion, sent → signed rate, time to sign, share of receivers who open the summary
- **Business:** individual → paid conversion, agency seats, AI cost per signed document
- **Trust:** 100% of signed documents verifiable

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AI gives wrong legal advice | High | Mandatory citations, "AI risk review" label + disclaimer, lawyer escalation for high risk, eval set in CI |
| Law data incomplete or out of date (HF snapshot) | High | lex.uz RSS sync, law version date on each review, "no norm found" instead of guessing |
| **Personal data localization law (Uzbekistan)** | High | Legal review before launch; local hosting for personal data; remove names and IDs before the AI call |
| Ed25519 seal not enough in court | Medium | E-IMZO integration (Phase 6) |
| lex.uz access blocked or terms change | Medium | Request official access; HF corpus as fallback; low request rate |
| Prompt injection via uploaded document | Medium | Treat document text as data, structured output, validate edits |
| PDF editing quality | Medium | DOCX-first for corrections; sender approves every diff |
| AI cost per document too high | Medium | Plan quotas, caching, effort tuning per route |
| Uzbek language quality of embeddings | Medium | Hybrid search, test Voyage vs bge-m3 in Phase 1 |

---

## 10. Open decisions

1. Corrected-document format: DOCX only, or also PDF?
2. Embedding model: Voyage AI (hosted) or bge-m3 (self-hosted)?
3. Official lex.uz / Ministry of Justice data access: request now?
4. Data localization: hosting in Uzbekistan, or removing personal data before the AI call?
5. E-IMZO: in the MVP or Phase 6?
6. Do receivers see AI-flagged issues the sender left in the contract?
7. Which document types for v1 (rental, employment, sale, services, NDA)?

---

## 11. Glossary

- **RAG**: retrieval-augmented generation. Search relevant law first, then let the AI answer using only that.
- **Seal**: Ed25519 signature over the signed document's SHA-256 hash.
- **Certificate of Completion**: record of who signed, when, from where, and which summary they saw.
- **E-IMZO**: Uzbekistan's national digital signature system.
- **Anchor codes**: main codes always included in retrieval for a document type (e.g. the Civil Code for contracts).
