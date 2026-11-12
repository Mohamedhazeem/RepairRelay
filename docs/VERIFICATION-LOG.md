# RepairRelay — Verification Log

**Last updated:** 12 November 2026  
**Purpose:** record only tests actually run. Do not convert planned work into a passing result.

## 1. Current status

| Area | Status | Evidence / next action |
|---|---|---|
| Product decision and project documents | FINAL | Product spec, UX spec, architecture, API contracts, integration notes and this log are complete and kept in sync with the implementation. |
| Channel3 documentation review | REVIEWED | Official API/search/locale/caching docs reviewed; authenticated responses now captured (V-002). |
| Channel3 live API | **PASS** | 9 authenticated searches + 2 detail refreshes, HTTP 200; schemas captured in V-002/V-003. |
| Channel3 spare-part coverage | **INSUFFICIENT → PIVOT SELECTED** | Only 1 genuine iPhone 13 display part found (needs ≥2). Repair-versus-Replace mode selected per documented fallback; replacement-device coverage is strong. See V-004. |
| PayPal sandbox OAuth | **PASS** | Token issued (scope present, 32400s). See V-005. |
| PayPal order creation (AUTHORIZE) | **PASS** | HTTP 201, one purchase unit, USD 95.00. See V-005. |
| PayPal buyer approval / authorize | **PASS** | Official sandbox UI approval (SDK page + hosted page); order `APPROVED`; authorization `29294125B72500359` USD 95.00. Buyer-cancel path also observed (`onCancel` fired, no authorization). See V-007. |
| PayPal capture / void | **PASS** | Capture `3EC39096GD493553N` COMPLETED → auth `CAPTURED`; void → auth `VOIDED`; void-after-capture and capture-after-void both rejected by PayPal with the expected errors. See V-007. |
| AI vision API | **PASS** | `nvidia/nemotron-3.5-super-vl-120b-a12b` via NVIDIA NIM; schema-valid JSON, honest UNASSESSED on unrelated image. See V-006. |
| Application build | **PASS** | `npm run build` clean at f7adc8e and re-verified 12 Nov 2026; all 38 routes dynamic, middleware active. See §4. |
| E2E | **PASS** | `npx playwright test` 2/2 at f7adc8e and re-verified 12 Nov 2026 with real AI + Channel3. PayPal buyer approval is covered by the manual sandbox rehearsal (V-007). See §4. |
| Devpost submission | NOT SUBMITTED | Deadline 13 Nov 2026 1:30 AM IST. |

## 2. How to record a verification

For each test record:

- Date/time and timezone.
- Commit SHA (if code exists).
- Exact command/test case (without secrets).
- Environment: local/sandbox/production (production is out of MVP scope).
- Expected result.
- Actual result and sanitized provider status/request ID.
- PASS / FAIL / BLOCKED.
- Known limitation and follow-up action.

Never paste access tokens, client secrets, API keys, buyer passwords, card data, full private images or unredacted provider payloads into this file.

## 3. Verification entries

### V-001 — Documentation review

- Date: 8 November 2026
- Area: PayPal AI Hackathon rules, Channel3 Search API, response/offer/locale/caching/rate-limit docs, PayPal Orders authorization/capture/void docs.
- Result: REVIEWED (documentation only).
- Limitation: does not prove the user's individual API account or product catalog results.

### V-002 — Channel3 authenticated search feasibility

- Date/time: 8 November 2026, ~00:40–01:00 IST
- Commit: bde6f14 (harness), repository initialized at eed45f9 (SHAs from before the authorship rewrite of 8 Nov)
- Command: `node --env-file=.env.local scripts/feasibility/channel3-search.mjs --query "<query>" --limit 5|8 [--save slug]`
- Environment: local, server-side key, locale `{"country":"US","currency":"USD","language":"en","mode":"default"}`
- Expected: HTTP 200 with `products[]`, offers, and a documented price shape.
- Actual: **HTTP 200 on all 9 queries.** Queries run (in order):
  1. `Apple iPhone 13 OLED screen replacement assembly`
  2. `iPhone 13 OLED display digitizer replacement`
  3. `iPhone 13 replacement screen assembly refurbished`
  4. `Apple iPhone 13 replacement battery assembly`
  5. `Samsung Galaxy S23 OLED screen replacement assembly`
  6. `Refurbished unlocked Apple iPhone 13`
  7. `iPhone 13 LCD screen replacement` (negative control)
  8. `Apple iPhone 13 display replacement part` (limit 8)
  9. `iPhone 13 front screen glass and digitizer replacement part` (limit 8)
- Observed response shape (from raw fixtures in `tests/fixtures/channel3/`, tests only):
  - Top level: `products[]`, `next_page_token` (opaque string).
  - Product: `id`, `title`, `description`, `brands[]`, `images[]` (keys `url`, `cleaned_url`, `is_main_image`, `shot_type`, `alt_text`), `category` (object with `slug`/`title`/`path[]`), `structured_attributes` (object of arrays), `offers[]`.
  - Offer: `domain`, `url` (HTTPS, `buy.trychannel3.com` redirect style), `availability` (`InStock`), `condition` (`new`), **`price` is an object `{price: number, compare_at_price: number|null, currency: string}`**; offer-level `currency` is absent. This is the documented `price.price` variant.
  - A product can have multiple offers (observed: bestbuy $59 / adorama $99 / cdw $121.99 on one product).
  - Detail endpoint `GET /v1/products/{id}` adds `gender`, `age`, `materials`, `key_features`, `colors`, `ratings`.
- Result: **PASS** (API access and schema captured).
- Known limitation: search relevance mixes other models (Pixel 7 Pro, iPhone 11 Pro Max, iPhone 14 Pro under generic titles) and accessories (screen protectors, MagSafe packs) into part queries. App must inspect title/description/attributes and never treat relevance as compatibility.

### V-003 — Channel3 product detail refresh

- Date/time: 8 November 2026, ~01:00 IST
- Command: `node --env-file=.env.local scripts/feasibility/channel3-detail.mjs --id jaFA4Tt` and `--id 6bShsMo`
- Expected: current offer fields with same auth header.
- Actual: **HTTP 200 both.** Offer drift observed: search showed `compare_at_price: 22.99` for product `jaFA4Tt`, detail refresh returned `compare_at_price: null` — live offer fields genuinely change between observations, confirming the refresh-before-display requirement.
- Result: **PASS**
- Known limitation: none observed; same `x-api-key` header works for search and detail.

### V-004 — Channel3 spare-part coverage gate decision (GO/PIVOT)

- Date/time: 8 November 2026, ~01:05 IST
- Evidence: V-002 fixtures; product identity inspection of candidates.
- GO condition required: ≥2 distinct, genuinely relevant component products with usable priced offers.
- Actual findings:
  - **1 genuine iPhone 13 display part**: `jaFA4Tt` "iPhone 13 Screen Replacement" (Incell LCD, glass-only per `structured_attributes`, walmart.com $20.20 USD InStock).
  - `zIKMGBC` "OLED LCD Screen Digitizer Full Assembly with Frame" looked relevant by title but its description declares it for **Google Pixel 7 Pro** — rejected.
  - Other part-category results were for iPhone 11 Pro Max / 14 Pro / 5S-SE, or accessories (screen protectors, MagSafe packs, adhesive gaskets).
  - Galaxy S23 display query: screen protectors and printer parts — no S23 spare parts.
  - Battery query: MagSafe external packs only, no internal battery assemblies.
  - Replacement devices: strong — multiple distinct iPhone 13 / 13 Pro listings (Gazelle $239.99–$369.99, Walmart $264.19, InStock, USD, new).
- **Decision: PIVOT to Repair-versus-Replace mode** per `docs/product/PRODUCT-SPEC.md` §5 pivot rule and the S0 gate decision step in `docs/plan/AGENT-START-PROMPT.md`. Channel3 will power live replacement-device comparisons (repair vs replace benchmark); the product must **stop claiming a parts-referenced Channel3 contract**. The human-approved versioned contract and PayPal lifecycle are preserved unchanged; the repairer declares the installed component without a Channel3 part reference.
- Result: **PIVOT SELECTED** (documented fallback, not a failure of the sponsor integration — live API use remains central and judge-visible).
- Next action: reflect the mode in S2+ product wording, contract references and demo script; never label a Channel3 device listing as a repair part.

### V-005 — PayPal sandbox OAuth and order creation

- Date/time: 8 November 2026, ~01:10 IST
- Command: `node --env-file=.env.local scripts/feasibility/paypal-feasibility.mjs oauth` and `create-order --amount 95.00`
- Environment: PayPal sandbox (`api-m.sandbox.paypal.com`)
- Expected: OAuth token; order created with `intent=AUTHORIZE`, one purchase unit.
- Actual: **OAuth HTTP 200** (scope present, `expires_in` 32400s); **create-order HTTP 201**, order id `8PL473918C8957611`, status `CREATED`, approval link returned. `PayPal-Request-Id` persisted locally before the call for retry idempotency.
- Result: **PASS**

### V-007 — PayPal buyer approval, authorization, capture and void (full lifecycle)

- Date/time: 8 November 2026, ~01:15–01:45 IST
- Command: `paypal-feasibility.mjs` subcommands `create-order` / `show-order` / `authorize` / `show-auth` / `capture` / `void`; official PayPal sandbox UI in the ZCode in-app browser (JS SDK probe page on `127.0.0.1:3100` and the hosted `checkoutnow` approval page).
- Environment: PayPal sandbox, browser at `127.0.0.1` origin, sandbox buyer account "John Doe".
- Sequence and actual results:
  1. JS SDK page rendered the official PayPal Buttons (`intent=authorize`, USD) — PASS (SDK integration renders and opens the approval popup).
  2. First order `8PL473918C8957611` (no `return_url`): buyer signed in and reached the payment page inside the SDK popup; the final in-popup click was completed as a cancellation, so **`onCancel` fired and the probe displayed "Buyer cancelled — no authorization exists"** — PASS (documented buyer-cancel path verified; no authorization created).
  3. Full-page `checkoutnow` flow without `return_url`: the hosted page hung at "Review Order — Loading…" (no redirect target). Root cause: orders created without `return_url` cannot complete the hosted-page flow. Fixed by adding `application_context.return_url`/`cancel_url` to `create-order`.
  4. Order `64P03942GE3951408` (USD 95.00, with return URLs): buyer approval completed on the hosted page; redirect landed on the return URL with `token` + `PayerID`; `show-order` returned **status `APPROVED`**.
  5. `authorize --order 64P03942GE3951408`: **HTTP 201**, order `COMPLETED`, authorization id `29294125B72500359`, raw status `CREATED`, amount USD 95.00, expiry 2026-12-07T03:04:10Z. **No `AUTH_CAPTURE_NOT_ENABLED`** — the sandbox merchant supports AUTHORIZE.
  6. `capture --auth 29294125B72500359`: **HTTP 201**, capture id `3EC39096GD493553N`, status `COMPLETED`; `show-auth` then returned authorization status **`CAPTURED`**.
  7. Negative test — `void` on the captured authorization: **HTTP 422 `PREVIOUSLY_CAPTURED`** ("Authorization has been previously captured and hence cannot be voided.") — provider enforces the no-void-after-capture invariant.
  8. Order `20T04538KC089600U` (USD 40.00, with return URLs): approved via hosted page, `authorize` returned authorization id `51Y72945K69958937` (USD 40.00); `void`: **HTTP 204**; `show-auth` returned status **`VOIDED`**.
  9. Negative test — `capture` on the voided authorization: **HTTP 422 `AUTHORIZATION_VOIDED`** — provider enforces no-capture-after-void.
- Result: **PASS — full authorization/capture/void lifecycle verified in sandbox.**
- Known limitations / notes for S6 implementation:
  - Orders must include `return_url`/`cancel_url` for any hosted-page fallback flow; the JS SDK popup flow works without them but the popup's inner frame is not reliably clickable by browser automation — the product demo uses the real buyer click.
  - OAuth token cached with expiry in `data/feasibility/` (gitignored); request IDs persisted per operation for retry idempotency.
  - Authorization expiry observed as ~29 days; the demo completes in one sitting regardless.
  - One transient HTTP 415 occurred (probe bug: missing `Content-Type` on body-less POST) — fixed in the probe; not a PayPal issue.

### V-006 — AI vision structured diagnosis

- Date/time: 8 November 2026, ~01:20 IST
- Commit: bde6f14 (harness; JSON-extraction fix after)
- Command: `AI_REQUEST_TIMEOUT_MS=120000 node --env-file=.env.local scripts/feasibility/ai-vision.mjs --image tests/fixtures/ai/sample-device.png`
- Provider: NVIDIA NIM (`integrate.api.nvidia.com`), OpenAI-compatible chat completions, image via `image_url` data URL.
- Model selection notes: the initially configured `google/gemma-4-31b-it` hung (timeout at 25s/90s, twice) despite appearing in the account's model list; several listed models returned 404 "Not found for account". `nvidia/nemotron-3.5-super-vl-120b-a12b` responded (user-selected as `AI_MODEL`). `AI_MODEL` was updated in `.env.local` accordingly.
- Expected: one real image request returns schema-valid structured JSON within timeout.
- Actual: **HTTP 200, latency ~6.5–7s, ~2k tokens.** Output validated against the application diagnosis schema (confidence bands only). Honesty check passed: with the synthetic abstract test image, the model did **not** invent a damaged device — it reported what was visible, set `overallConfidence: UNASSESSED`, `likelyRepairCategory: UNASSESSED`, and asked for a real device photo.
- Result: **PASS**
- Known limitation: reasoning-style output may split JSON between `reasoning_content` and `content`; the adapter must extract JSON robustly (implemented in the probe, to be replicated in the app adapter). Latency ~7s is acceptable for the demo but needs a visible loading state.

## 4. Application test log

| Date | Commit | Command | Result | Notes |
|---|---|---|---|---|
| 2026-11-08 | S1 working tree | `npx tsc --noEmit` | PASS | 0 errors after fixing `LayoutProps` usage |
| 2026-11-08 | S1 working tree | `npx eslint .` | PASS | 0 problems |
| 2026-11-08 | S1 working tree | `npm test` (Vitest) | PASS | 24/24 across 5 files (money, envelope, auth/session/guards, upload config, seed integration) |
| 2026-11-08 | S1 working tree | `npm run build` | PASS | All routes dynamic; middleware active; `cacheComponents` disabled (session-aware pages) |
| 2026-11-08 | S1 working tree | `npx prisma migrate dev` + `tsx prisma/seed.ts` | PASS | Migration `s1_identity`; 5 demo accounts seeded idempotently |
| 2026-11-08 | S1 working tree | Boot check via `next start` + curl | PASS | Customer/repairer/admin login 200; `/me` returns session; wrong password 401; customer→`/repairer` 307 home; unauthenticated→`/login?next=…`; logout clears session (me → 401) |
| 2026-11-08 | S2 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S2 working tree | `npm test` (Vitest) | PASS | 46/46 across 9 files (added: diagnosis schema, AI JSON extraction, rate limiter, image-pipeline/ownership integration) |
| 2026-11-08 | S2 working tree | `npm run build` | PASS | New routes: `/repairs/new`, `/repairs/[repairId]`, assets/diagnosis APIs |
| 2026-11-08 | S2 working tree | Live E2E via `next start` + curl | PASS | Real upload of synthetic image → sharp re-encode (EXIF stripped) → real NVIDIA AI call → `DIAGNOSIS_READY`, confidence MEDIUM, category DISPLAY_REPLACEMENT, 3 observations / 4 unknowns / 3 questions; owner preview 200 (image/png), unauthenticated 401, wrong user 403 |
| 2026-11-08 | S2 working tree | AI failure path | DESIGNED, unit-covered | Timeout/invalid-JSON map to `DEPENDENCY_UNAVAILABLE` with draft retained (service + adapter injected-fetch tests); live outage path not forced in production run |
| 2026-11-08 | S3 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S3 working tree | `npm test` (Vitest) | PASS | 66/66 across 12 files (added: normalizer matrix incl. real fixture, client error mapping with injected fetch, discovery/selection integration with adapter doubles) |
| 2026-11-08 | S3 working tree | `npm run build` | PASS | New routes: product-search GET/POST, refresh, selection, `/repairs/[repairId]/products` |
| 2026-11-08 | S3 working tree | Live E2E via `next start` + curl | PASS | Real Channel3 replacement-device search for iPhone 13: 5 eligible device offers (241.99–469.99 USD, bestbuy/gazelle), all `NOT_VERIFIED_BY_CHANNEL3`; detail refresh returned fresh 469.99 USD @ bestbuy.com; selection succeeded with server re-fetch + exact price match; mismatched selection correctly returned 409 with fresh values |
| 2026-11-08 | S4 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S4 working tree | `npm test` (Vitest) | PASS | 79/79 across 14 files (added: deterministic pricing, quote generation idempotency/prerequisites, CAS selection incl. stale version / double select / attestation guard) |
| 2026-11-08 | S4 working tree | `npm run build` | PASS | New routes: quotes GET/POST, quote select, `/repairs/[repairId]/quotes` |
| 2026-11-08 | S4 working tree | Live E2E via `next start` + curl | PASS | 3 deterministic SIMULATED quotes generated (94.48 / 104.98 / 115.48 USD, 90/180/365-day warranties), all CONFIRMED_FOR_DEMO with simulated-attestation notes; regeneration idempotent; selection marked SELECTED + others SUPERSEDED; second select and stale expectedRepairVersion both returned 409 |
| 2026-11-08 | S5 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S5 working tree | `npm test` (Vitest) | PASS | 92/92 across 15 files (added: contract creation/immutability, approval CAS + double-click, change request authorization + deterministic diff, approve/reject decision paths, history preservation) |
| 2026-11-08 | S5 working tree | `npm run build` | PASS | New routes: contract GET/POST, approve, change-requests, decision, repairer contracts; contract review + repairer workbench UI |
| 2026-11-08 | S5 working tree | Live E2E via `next start` + curl | PASS | Contract v1 created from selected quote ($94.48) → customer approved (CAS) → repairer proposed change (part 5949→7999, warranty 90→365; server-computed diff; new total $114.98) → customer approved → v2 in force with v1 preserved in history. Amount-change-with-existing-payment path deferred to the S04 payment orchestrator by slice design |
| 2026-11-08 | S6 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S6 working tree | `npm test` (Vitest) | PASS | 102/102 across 16 files (added: order creation guards + idempotency, authorization amount match/decline/timeout, buyer cancel, reconcile from provider reads, ownership) |
| 2026-11-08 | S6 working tree | `npm run build` | PASS | New routes: paypal-order, authorize, cancel, config, payments reconcile; payment page with official JS SDK |
| 2026-11-08 | S6 working tree | Live E2E via `next start` + curl + hosted approval | PASS | Real order `7TP61506GX975205D` created for the approved contract ($114.98, one purchase unit, USD); duplicate order click returned the same order; buyer completed hosted approval (return URL redirect observed); reconciliation mapped APPROVED → BUYER_APPROVAL_PENDING; server-side authorize returned AUTHORIZED with authorization `6UG97296AT193300A`, expires 2026-12-07; duplicate onApprove idempotent. Lesson: hosted-flow approvals surface via reconciliation (`BUYER_APPROVAL_PENDING`) and are authorizable; SDK popup cancel path marks BUYER_CANCELLED without any authorization |
| 2026-11-08 | S7 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 1 warning |
| 2026-11-08 | S7 working tree | `npm test` (Vitest) | PASS | 108/108 across 17 files (added: job start gates, deterministic evidence rules, stale-version/duplicate submission, asset ownership) |
| 2026-11-08 | S7 working tree | `npm run build` | PASS | New routes: job/start, evidence/assets, evidence; workbench evidence form; customer evidence view |
| 2026-11-08 | S7 working tree | Live E2E via `next start` + curl | PASS | Job started live (gates passed: approved contract + AUTHORIZED payment); after-photo uploaded through the private pipeline; evidence submitted → job CUSTOMER_REVIEW; duplicate submit → 409; real AI advisory assessment recorded (INCOMPLETE, MISSING_COMPONENT_LABEL_PHOTOS flag — correct: no label photo provided). Fix during slice: reasoning-model output split content/reasoning fields now extracted with balanced-brace scanning; outage → UNAVAILABLE with customer-informed state |
| 2026-11-08 | S8 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S8 working tree | `npm test` (Vitest) | PASS | 115/115 across 18 files (added: ownership, per-submission decision immutability, rework cap + supersede, cancel with/without authorization, stale version/evidence guards) |
| 2026-11-08 | S8 working tree | `npm run build` | PASS | New route: customer-decision; DecisionPanel with confirm dialogs |
| 2026-11-08 | S8 working tree | **Live full happy path** via `next start` + curl | PASS | Live rework decision (REWORK_IN_PROGRESS, no capture, auth untouched) → repairer resubmission (INCOMPLETE advisory) → customer ACCEPT → **real PayPal capture `6SV67765LK889111T` COMPLETED → payment CAPTURED, repair COMPLETED**. Bug found and fixed live: duplicate-decision guard was per-job, corrected to per-submission (legitimate post-rework decisions) |
| 2026-11-08 | S9 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S9 working tree | `npm test` (Vitest) | PASS | 123/123 across 19 files (added: accept-decision guard, expiry block, DB-level CAS concurrency, void-after-capture, authorization-resource reconciliation resolving unknowns to CAPTURED/AUTHORIZED/VOIDED, amount-change void with contractChange context) |
| 2026-11-08 | S9 working tree | Hardening notes | DONE | createOrderForContract now validates expectedContractVersion (bug found by the S9 tests); reconcile→CAPTURED completes the repair; amount-change void keeps the contract APPROVED (re-authorization required); quote generation scoped to seeded repairer emails |
| 2026-11-08 | S10 working tree | `npx tsc --noEmit` / `npx eslint .` | PASS | 0 errors, 0 warnings |
| 2026-11-08 | S10 working tree | `npm test` (Vitest) | PASS | 128/128 across 20 files (added: passport gate before capture/accept, wrong-user refusal, historical labels, chronological timeline, unavailable-evidence marking) |
| 2026-11-08 | S10 working tree | `npm run build` + live check | PASS | Live passport issued for the S8 completed repair: capture 6SV67765LK889111T, $114.98, contract v2 with 2-version history, SIMULATED repairer declaration, historical replace-benchmark label; page renders 200. Timeline empty for this repair (see incident note) |
| 2026-11-08 | S10 working tree | Test-hygiene incident | FIXED | Test cleanups were deleting audit events by type in the shared dev DB, wiping live demo timeline events. Fixed: scoped cleanup helper deletes only by exact aggregate ids collected before row deletion; orphaned test-era events purged once. The S11 demo rehearsal regenerates a fresh timeline on a clean seed |
| 2026-11-08 | S11 working tree | `npm run db:demo-reset` + full fresh rehearsal | PASS | Clean seed → fresh repair RR-5FFA02130EB7: honest AI UNASSESSED on the abstract test image → live Channel3 8 results → reference selected (469.99 USD @ bestbuy) → 3 quotes (94.48/104.98/115.48) → contract approved → real order 8D038165MB9727452 → buyer approval → onApprove hit a temporarily stopped app server → AUTHORIZATION UNKNOWN shown (correct) → admin reconcile → APPROVED → authorize 6VD005983E956501N AUTHORIZED → job → evidence (duplicate-guard verified) → ACCEPT → **real capture 05B546881E914581A COMPLETED** → passport issued with **18 timeline events** |
| 2026-11-08 | S11 working tree | `npx playwright test` | PASS | 2/2: full customer journey with real providers (12.7s) + role guards. Real UI gap found & fixed by E2E: quote selection now creates the contract draft (was curl-only) |
| 2026-11-08 | S11 working tree | `npm run lint` / `typecheck` / `test` / `build` | PASS | Final gates: 0/0 lint, 128/128 Vitest, build clean |
| 2026-11-08 | Docs-vs-implementation audit | Full cross-check of API-CONTRACTS / DATA-MODEL / UX-DESIGN / scope-ownership | PASS with 3 gaps found and fixed | All 21 documented API endpoints implemented (capture/void as internal orchestration per the contracts' own "prefer internal" note); all documented entities in the schema; all 11 UX screens mapped. **Gaps found and fixed:** (1) intake functionality checklist was UI-only — now persisted and fed to the AI diagnosis input per AI-AND-EVIDENCE §3; (2) demo-operator reset was CLI-only — now an admin-gated UI button + POST /api/admin/demo-reset (403 for customers, verified); (3) rate limiting existed only on AI diagnosis — now also on product search, uploads, evidence uploads and payment mutations per ARCHITECTURE §7 (in-memory limiter, single-instance limitation documented). Remaining accepted gaps: CSRF relies on SameSite=Lax (no token); responsive/keyboard manual pass pending; PDF passport export skipped per documented cut order |

| 2026-11-12 | f7adc8e + working tree | `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | PASS | Full regression re-run at current HEAD: 0 lint problems, 0 type errors, 128/128 Vitest (20 files), clean production build with all 38 routes dynamic. |
| 2026-11-12 | f7adc8e + working tree | `npx playwright test` | PASS | 2/2 re-run with real providers: customer journey 1.1 min (real AI diagnosis + live Channel3 search) and role guards. PayPal buyer approval remains covered by the manual sandbox rehearsal (V-007). |
| 2026-11-12 | working tree | Prisma state probe (`paymentAttempt` / `paymentOperation`) | PASS | 0 unresolved payment UNKNOWNs (`AUTHORIZATION_UNKNOWN`/`CAPTURE_UNKNOWN`/`VOID_UNKNOWN`) and 0 open operations (`STARTED`/`UNKNOWN`). No optimistic or fabricated success state persisted. |
| 2026-11-12 | working tree | `next start -p 3102` + curl guard probe | PASS | `/`, `/repairs`, `/repairer`, `/admin/demo` all 307 to `/login?next=…`; `/api/auth/me` returns 401 JSON with a traceId. Production-mode role middleware confirmed active. |
| 2026-11-12 | working tree | Dashboard, nav and sign-in hardening | DONE | `/repairs` rebuilt from the S1 stub into a real dashboard: active repair cards with status, next action, contract total and payment state; recent completed/cancelled list; audit activity feed. Customer nav de-duplicated to Overview / Activity / Start a repair. Sign-in throttle added (10 failed attempts / 5 min per email → 429 `RATE_LIMITED`, in-memory, single-instance limitation documented). Stale entries in this log and the execution checklist corrected. |
| 2026-11-12 | working tree | Sign-in throttle correction + unit tests | DONE | The first cut of the throttle counted *successful* sign-ins against the budget, which would have returned 429 to a demo user signing in repeatedly with a correct password (the manual checklist needs many same-account sign-ins). Changed to failure-only counting: the limit is peeked before the database lookup, consumed only on a failed authentication, and cleared on success. New unit tests cover `peek`/`record`/`reset` semantics. Verified live against `next start`: 12 consecutive sign-ins with the correct password all returned 200; 10 wrong passwords returned 401 and the 11th returned 429 `RATE_LIMITED`. |
| 2026-11-12 | working tree | Responsive sweep (360/768/1024/1440 × 9 routes) | PASS after 2 fixes | Automated horizontal-overflow measurement against the production build, with the stylesheet confirmed loaded (body background `rgb(245,247,250)`) before each measurement. First run found 60px overflow at 360px on every screen: the app-shell header (`DEMO ENVIRONMENT` badge + display name + sign-out) could not shrink. Fixed by letting the header and nav wrap. Second run still found 12px overflow at 360px on the dashboard activity feed, whose timestamp used a fixed `w-40 shrink-0`; changed to full-width below `sm` with a `min-w-0` label. Final run: **0 overflowing combinations out of 36**. |
| 2026-11-12 | working tree | Keyboard / focus / reduced-motion check | PASS | Tab order on the dashboard is logo → sign out → Overview → Activity → Start a repair → content links, all reachable. The author `:focus-visible` rule (`outline: 2px solid var(--color-brand)`) was confirmed applied in a real browser (`solid rgb(15,118,110)`) — headless Chromium reports the UA focus ring instead, which is a harness quirk, not an app defect. `prefers-reduced-motion: reduce` confirmed honoured. The dialog focus trap still needs an eyeball pass during the manual demo checklist. |
| 2026-11-12 | working tree | Status badge alignment fix | PASS | A status badge in a flex row was blockified to `display:flex` and shrunk below its content width, so the label wrapped onto two lines and hugged the left edge of the leftover space (badge box 114.5px vs 70px of text). Fixed by centring the badge label (`text-center` + `justify-center` on `StatusBadge`) and stopping the short status badges from shrinking (`shrink-0`), with the card header and the diagnosis badge row allowed to wrap. Measured on `/repairs`: badge now 163px × 22px, one line, `text-align: center`. Re-swept 9 real routes × 4 widths (the earlier sweep used top-level paths that do not exist — `/products`, `/quotes`, `/contract`, `/payment` — so those entries had been 404 pages; the sweep now uses the real `/repairs/<id>/…` routes): **0 overflowing combinations out of 36**, and no status badge wraps to a second line. |
| 2026-11-12 | final working tree | `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` / `npx playwright test` | PASS | Final gate run after every fix above: 0 lint problems, 0 type errors, **131/131 Vitest (20 files)**, clean production build (38 routes, all dynamic), 2/2 Playwright specs with real AI + live Channel3. |

### V-008 — S1 foundation slice

- Date/time: 8 November 2026, ~09:00 IST
- Scope: Next.js 16 App Router + TypeScript strict + Tailwind 4 (UX-spec tokens) + Prisma 6/PostgreSQL 16 + jose cookie sessions + role middleware + money/envelope/storage primitives + Vitest.
- Decisions: session auth implemented as a signed HttpOnly cookie (`jose` HS256, 7-day TTL) — the documented "Auth.js or equivalent" option, chosen for zero-beta-deps; Prisma pinned to 6.x stable (v8 is RC); Next `cacheComponents` disabled because every page is session-aware.
- Result: **PASS** (see application test log above). Demo accounts: customer / 3 simulated repairers / demo admin, all seeded from `DEMO_SEED_PASSWORD` (gitignored `.env.local`).
- Known limitation: no E2E (Playwright) yet — scheduled for later slices; component tests still shallow at S1.

## 5. Release sign-off

Do not mark the project release-ready until:
- all P0 external integration gates pass;
- all P1 E2E flows pass;
- no payment `UNKNOWN` state is left unresolved in the recorded demo;
- public repository contains no secrets;
- submission checklist is completed and Devpost receipt verified.
