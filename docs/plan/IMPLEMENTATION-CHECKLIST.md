# RepairRelay — Execution Checklist

Use this file as the live progress tracker. Only check an item after it is implemented and verified. Link evidence or a commit in the Notes column in the working repository. Keep the verification log synchronized.

## Gate 0 — External feasibility (must pass before app feature build)

- [x] Channel3 key obtained and stored server-side.
- [x] `POST /v1/search` succeeds in US/USD/en `default` mode.
- [x] Sanitized real response saved as test fixture only.
- [x] Actual product/offer/price shape recorded and validated. (`price` object `{price, compare_at_price, currency}`; offer-level `currency` absent; images `cleaned_url` optional; detail adds gender/materials/ratings — see VERIFICATION-LOG V-002.)
- [x] At least two relevant parts with usable priced merchant offers found, or fallback explicitly selected. → **Fallback selected: Repair-versus-Replace mode** (only 1 genuine iPhone 13 part; replacement-device coverage strong). See V-004.
- [x] Product details refresh returns current offers.
- [ ] Channel3 credits/usage checked. (Dashboard check pending; ~11 search + 2 detail calls used.)
- [x] PayPal sandbox buyer and business accounts created. (User-provided.)
- [x] PayPal OAuth works.
- [x] Sandbox merchant `AUTHORIZE` capability confirmed. (No `AUTH_CAPTURE_NOT_ENABLED`; authorization 201 CREATED.)
- [x] PayPal buyer approval works through official SDK/UI. (SDK Buttons render + hosted page approval; buyer-cancel path observed.)
- [x] PayPal authorization succeeds and returns authorization ID.
- [x] PayPal capture succeeds on a test authorization.
- [x] PayPal void succeeds on a separate uncaptured authorization.
- [x] AI vision provider key and model verified independently. (`nvidia/nemotron-3.5-super-vl-120b-a12b`; initial `google/gemma-4-31b-it` hangs — replaced in `.env.local`.)
- [x] One sample image produces schema-valid structured diagnosis.
- [x] GO/PIVOT decision recorded in verification log. (V-004: PIVOT to Repair-versus-Replace.)

## S1 — Foundation

- [x] Existing repository inspected; no working code overwritten.
- [x] TypeScript / lint / test / build scripts confirmed. (Next 16 App Router, TS strict, ESLint 9, Vitest 5)
- [x] PostgreSQL and Prisma configured. (Postgres 16 local; Prisma 6.19, migration `s1_identity`)
- [x] Auth/session and demo role checks implemented. (jose-signed HttpOnly cookie session; edge middleware + per-page guards; `requireRole` primitives)
- [x] Customer, simulated repairer and demo admin seeded. (5 accounts, idempotent upsert seed)
- [x] Design tokens and app shell implemented. (UX-spec palette via Tailwind 4 `@theme`; top bar, role nav, demo banner, simulated badge, states)
- [x] Shared error envelope / trace ID implemented. (`src/lib/http/errors.ts`, 12 stable codes)
- [x] Money minor-unit helper implemented and tested. (`src/lib/money`, strict parse/format)
- [x] Private storage abstraction implemented. (`StorageAdapter` + local private driver, key-safety regex)
- [x] `.env.example` matches actual runtime variables.
- [x] Baseline lint/typecheck/test/build pass. (24/24 tests; boot check verified all 3 role logins + role isolation + logout)

## S2 — Repair intake and AI

- [x] Create repair request. (`POST /api/repairs`, contract-shaped response)
- [x] Device selection and model-unknown handling. (Controlled catalog + "Other" free text → `UNKNOWN` confidence, exact part search blocked downstream)
- [x] Symptom entry and functionality checklist.
- [x] File allowlist/size/count validation. (JPEG/PNG/WebP, 8 MB, max 4; enforced pre- and post-re-encode)
- [x] Actual image decode/re-encode/EXIF removal. (sharp content sniffing beats browser MIME; SVG/HTML/animated rejected)
- [x] Private upload/read authorization. (Owner-only preview; 401 unauthenticated, 403 wrong user — verified live)
- [x] Vision AI provider adapter. (OpenAI-compatible, injectable fetch, response_format fallback, timeout→unknown)
- [x] Diagnosis Zod schema and prompt. (Strict schema, JSON extraction across content/reasoning_content)
- [x] Visible observations / suspected causes / unknowns shown separately.
- [x] Confidence bands only; no arbitrary percentage. (`"87%"` rejected by schema test)
- [x] Inconclusive/error/manual continuation flow. (DIAGNOSIS_INCONCLUSIVE / FAILED keep the draft; retry + manual path in UI)
- [x] Diagnosis tests pass. (46/46 total; live end-to-end: real upload → real NVIDIA AI → DIAGNOSIS_READY, MEDIUM, DISPLAY_REPLACEMENT)

## S3 — Channel3

- [x] Server-only Channel3 adapter. (`src/integrations/channel3/client.ts`, key never leaves server, timeout + bounded 429 retry with jitter)
- [x] Raw response schema matches actual live response. (Zod schemas written from S0 fixtures V-002; per-product/per-offer fail-soft, envelope fail-closed)
- [x] Optional/missing product fields handled. (description/images/brands/next_page_token variants tested)
- [x] Offer parser handles only verified price shape(s). (`{price, compare_at_price, currency}` only; "From $45" strings and unknown shapes fail closed)
- [x] Currency and URL validation. (USD-only, HTTPS-only, positive finite price, domain required)
- [x] Product detail refresh. (`GET /v1/products/{id}` before selection; 404 → candidate unavailable, no stale resurrection)
- [x] Product cards show live timestamp and candidate disclaimer. ("Candidate listings — Channel3 does not certify condition or authenticity" + observed-time label)
- [x] No-offer products cannot be selected. (`selectionEligible=false`; select button only when eligible AND fresh)
- [x] No stale offer UI fallback. (Offer observations carry `expiresAt` TTL 10 min; expired → "Offer not current — refresh"; GET surfaces not-fresh)
- [x] Empty, timeout, 401/403, 429, 5xx and malformed response handling. (All mapped + unit-tested with injected fetch; empty state offers new search, no placeholders)
- [x] Parts-referenced mode or repair-versus-replace fallback verified. (**Repair-versus-Replace live-verified**: real search returned 5 device offers 241.99–469.99 USD; refresh + selection OK; stale/mismatched selection → 409 OFFER_CHANGED)

## S4 — Quotes

- [x] Three seeded repairers labelled SIMULATED. (Seed profiles + `SIMULATED REPAIRER` badges; `demoActor: true` in API)
- [x] Itemized quote data. (Part charge, labour, fees/tax fields, warranty, ETA, scope, exclusions, attestation)
- [x] Retail reference price separated from repairer part charge. (Repair-versus-Replace mode: replacement-device benchmark shown separately; quote part charge is technician-declared — no Channel3 part reference on quotes)
- [x] Deterministic total calculation. (`computeQuote` — same inputs always produce identical minor-unit totals; regeneration idempotent, unit-tested)
- [x] Warranty, scope, exclusions and ETA.
- [x] Quote expiry and selection rules. (48h validity; expired/unconfirmed/zero-total not selectable; CAS GENERATED→SELECTED; others SUPERSEDED; stale version → CONFLICT)
- [x] Quote tests pass. (79/79 total; live check: 3 quotes 94.48–115.48 USD generated, selection + double-select 409 verified)

## S5 — Contract and changes

- [x] Immutable Repair Contract version created. (Snapshot frozen from selected quote; versions append-only; history readable — live-verified)
- [x] Contract review screen shows all terms. (Part/labour/total, warranty, scope, exclusions, simulated attestation, historical replace-benchmark, payment explanation, SIMULATED + SANDBOX badges)
- [x] Explicit customer approval. (Confirm dialog; `confirmed:true` required)
- [x] Optimistic version check. (CAS on contract.version; stale version and duplicate approve → 409 — unit + live tested)
- [x] Change request includes reason and before/after values. (Repairer-only via workbench form; server computes deterministic diff; work pauses while PENDING)
- [x] Customer approve/reject path. (Approve activates proposed version; reject preserves prior contract)
- [x] Rejected change keeps original contract. (Unit-tested: total unchanged, proposed version superseded)
- [ ] Amount change triggers void then new buyer approval/authorization. (Deferred to S6/S9 by design: S03 never calls PayPal; no payment exists at S5 — the S04 orchestrator will own void/reauthorize when an authorization exists)
- [x] Contract tests pass. (92/92 total; live: create $94.48 → approve → repairer change (+$20.50 part, 365-day warranty) → customer approve → v2 current $114.98, v1 preserved)

## S6 — PayPal approval and authorization

- [x] PayPal JS SDK Buttons configured `intent=authorize`. (Official SDK on the payment page; server-side actions only)
- [x] Server-side order create with one purchase unit. (Amount decimal from minor units; `PayPal-Request-Id` persisted before the call)
- [x] Amount/currency verified against approved contract. (Exact match required; mismatch → AUTHORIZATION_DECLINED + audit, no AUTHORIZED)
- [x] Idempotency operation persisted before provider call. (PaymentOperation + deterministic key; duplicate clicks return the same order; duplicate onApprove idempotent)
- [x] Buyer cancel and SDK error paths. (onCancel marks BUYER_CANCELLED, no authorization; SDK error shows retry guidance)
- [x] Backend order authorization. (Order must belong to the customer + current contract version; hosted-page approvals reconciled then authorized)
- [x] Authorization ID and raw status persisted.
- [x] Repair cannot start until confirmed AUTHORIZED. (Workbench gate arrives in S7; state machine already blocks)
- [x] Timeout/unknown reconciliation test passes. (Timeout → AUTHORIZATION_UNKNOWN → admin reconcile endpoint restores state from provider reads)

## S7 — Repairer work and evidence

- [ ] Simulated repairer workbench.
- [ ] Job start authorization/contract preconditions.
- [ ] Before/after assets.
- [ ] Component declaration and identity basis.
- [ ] Functional checklist.
- [ ] Evidence submission bound to contract version.
- [ ] Evidence completeness rules.
- [ ] AI advisory assessment and unavailable state.
- [ ] Evidence access control tests.

## S8 — Customer decision

- [ ] Customer review page shows evidence and caveats.
- [ ] Explicit Accept confirmation.
- [ ] Request rework (no capture).
- [ ] Cancel (void required if authorized).
- [ ] Decisions reference latest evidence/current contract.
- [ ] Duplicate/racing decision rejected safely.

## S9 — PayPal capture, void and reconciliation

- [ ] Capture only after explicit acceptance.
- [ ] Void only after cancellation or approved amount-change workflow.
- [ ] Confirmed provider result required for CAPTURED/VOIDED.
- [ ] Capture timeout shows unknown and reconciles.
- [ ] Void timeout shows unknown and reconciles.
- [ ] Authorization expiry path.
- [ ] Duplicate capture/void prevented by idempotency.
- [ ] No attempt to void captured payment.

## S10 — Repair Passport

- [ ] Passport gated on accepted repair + confirmed capture.
- [ ] Historical contract/product reference clearly dated.
- [ ] Simulated repairer disclosure.
- [ ] Evidence, checks, warranty and payment reference displayed.
- [ ] Role/ownership tests pass.

## S11 — Hardening and submission

- [ ] Main Playwright happy path passes.
- [ ] Amount-change reauthorization E2E passes.
- [ ] Customer rework E2E passes.
- [ ] Customer cancel/void E2E passes.
- [ ] Channel3 empty/error E2E state checked.
- [ ] Security/authorization checks pass.
- [ ] 360/768/1024/1440 responsive checks pass.
- [ ] Keyboard and reduced-motion checks pass.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npx playwright test` passes.
- [ ] `npm run build` passes.
- [ ] README setup tested from a clean checkout.
- [ ] `.env.example` has no secrets.
- [ ] Root MIT license present.
- [ ] Public repository ready.
- [ ] Demo video under 3 minutes and shows functioning app.
- [ ] Submission entered before deadline.
- [ ] Devpost submission receipt verified.

## Current state

All checkboxes are intentionally unchecked. This pack contains specifications and plans; it does not claim the application or provider flows have been implemented or verified.
