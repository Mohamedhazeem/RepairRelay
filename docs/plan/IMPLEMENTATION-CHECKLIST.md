# RepairRelay — Execution Checklist

Use this file as the live progress tracker. Only check an item after it is implemented and verified. Link evidence or a commit in the Notes column in the working repository. Keep the verification log synchronized.

## Gate 0 — External feasibility (must pass before app feature build)

- [ ] Channel3 key obtained and stored server-side.
- [ ] `POST /v1/search` succeeds in US/USD/en `default` mode.
- [ ] Sanitized real response saved as test fixture only.
- [ ] Actual product/offer/price shape recorded and validated.
- [ ] At least two relevant parts with usable priced merchant offers found, or fallback explicitly selected.
- [ ] Product details refresh returns current offers.
- [ ] Channel3 credits/usage checked.
- [ ] PayPal sandbox buyer and business accounts created.
- [ ] PayPal OAuth works.
- [ ] Sandbox merchant `AUTHORIZE` capability confirmed.
- [ ] PayPal buyer approval works through official SDK/UI.
- [ ] PayPal authorization succeeds and returns authorization ID.
- [ ] PayPal capture succeeds on a test authorization.
- [ ] PayPal void succeeds on a separate uncaptured authorization.
- [ ] AI vision provider key and model verified independently.
- [ ] One sample image produces schema-valid structured diagnosis.
- [ ] GO/PIVOT decision recorded in verification log.

## S1 — Foundation

- [ ] Existing repository inspected; no working code overwritten.
- [ ] TypeScript / lint / test / build scripts confirmed.
- [ ] PostgreSQL and Prisma configured.
- [ ] Auth/session and demo role checks implemented.
- [ ] Customer, simulated repairer and demo admin seeded.
- [ ] Design tokens and app shell implemented.
- [ ] Shared error envelope / trace ID implemented.
- [ ] Money minor-unit helper implemented and tested.
- [ ] Private storage abstraction implemented.
- [ ] `.env.example` matches actual runtime variables.
- [ ] Baseline lint/typecheck/test/build pass.

## S2 — Repair intake and AI

- [ ] Create repair request.
- [ ] Device selection and model-unknown handling.
- [ ] Symptom entry and functionality checklist.
- [ ] File allowlist/size/count validation.
- [ ] Actual image decode/re-encode/EXIF removal.
- [ ] Private upload/read authorization.
- [ ] Vision AI provider adapter.
- [ ] Diagnosis Zod schema and prompt.
- [ ] Visible observations / suspected causes / unknowns shown separately.
- [ ] Confidence bands only; no arbitrary percentage.
- [ ] Inconclusive/error/manual continuation flow.
- [ ] Diagnosis tests pass.

## S3 — Channel3

- [ ] Server-only Channel3 adapter.
- [ ] Raw response schema matches actual live response.
- [ ] Optional/missing product fields handled.
- [ ] Offer parser handles only verified price shape(s).
- [ ] Currency and URL validation.
- [ ] Product detail refresh.
- [ ] Product cards show live timestamp and candidate disclaimer.
- [ ] No-offer products cannot be selected.
- [ ] No stale offer UI fallback.
- [ ] Empty, timeout, 401/403, 429, 5xx and malformed response handling.
- [ ] Parts-referenced mode or repair-versus-replace fallback verified.

## S4 — Quotes

- [ ] Three seeded repairers labelled SIMULATED.
- [ ] Itemized quote data.
- [ ] Retail reference price separated from repairer part charge.
- [ ] Deterministic total calculation.
- [ ] Warranty, scope, exclusions and ETA.
- [ ] Quote expiry and selection rules.
- [ ] Quote tests pass.

## S5 — Contract and changes

- [ ] Immutable Repair Contract version created.
- [ ] Contract review screen shows all terms.
- [ ] Explicit customer approval.
- [ ] Optimistic version check.
- [ ] Change request includes reason and before/after values.
- [ ] Customer approve/reject path.
- [ ] Rejected change keeps original contract.
- [ ] Amount change triggers void then new buyer approval/authorization.
- [ ] Contract tests pass.

## S6 — PayPal approval and authorization

- [ ] PayPal JS SDK Buttons configured `intent=authorize`.
- [ ] Server-side order create with one purchase unit.
- [ ] Amount/currency verified against approved contract.
- [ ] Idempotency operation persisted before provider call.
- [ ] Buyer cancel and SDK error paths.
- [ ] Backend order authorization.
- [ ] Authorization ID and raw status persisted.
- [ ] Repair cannot start until confirmed AUTHORIZED.
- [ ] Timeout/unknown reconciliation test passes.

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
