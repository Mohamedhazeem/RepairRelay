# RepairRelay — Scope Prompts for Specification and Planning

These prompts are mode-neutral. Use the same scope prompt with the repository's active SpecKit specification or planning command. They inherit:

- `docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md`
- `docs/product/PRODUCT-SPEC.md`
- `docs/product/UX-DESIGN.md`
- `docs/product/SCOPE-OWNERSHIP.md`
- `AGENTS.md` and `.specify/memory/constitution.md` if present
- established repository architecture and contracts

Do not redefine product decisions, expand scope, or duplicate another scope's ownership. Each prompt is for one bounded scope only.

---

## S00 — Foundation and design system

Work only within S00 ownership in `docs/product/SCOPE-OWNERSHIP.md`.

Own the shared Next.js/TypeScript foundation, global app shell, authentication/session baseline, role enforcement helpers, shared API error conventions, money primitives, upload abstraction, shared UI tokens and reusable primitives.

Define stable public contracts consumed by S01–S06. Identify shared-write hotspots and keep all root config / global schema changes under a single owner. Include responsive behavior, keyboard accessibility, loading/empty/error states, test conventions and secure server/client boundaries.

Do not implement repair intake, Channel3 behavior, quotes, PayPal workflows or evidence business rules. Do not add Redis, queues or microservices.

Acceptance expectation: app boots, seeded role login works, shared tokens/primitives exist, API errors and money formatting are deterministic, secret values remain server-side, baseline lint/typecheck/test/build passes.

## S01 — Repair intake and AI diagnosis

Work only within S01 ownership.

Implement customer repair intake, device/model selection, symptom entry, private image upload and multimodal AI diagnosis. The diagnosis must distinguish visible observations, suspected causes and unknowns; use confidence bands only, never arbitrary percentages. Validate AI output with a strict schema and preserve customer edits. Inconclusive image quality, irrelevant images, provider timeout, malformed JSON and quota failures must be recoverable without losing the draft request.

Enforce file allowlist, size/count limits, raster re-encoding, EXIF stripping, private asset access and upload ownership. The AI must never decide compatibility, choose the final part, approve contract terms or trigger payment.

Own repair intake/diagnosis data, pages, services and tests. Consume S00 session/storage contracts. Expose a stable repair request and diagnosis result contract to S02/S03.

Acceptance expectation: upload and structured diagnosis flow works with real AI key; a test provider is clearly labelled and used only in automated tests/demo fixtures; negative/low-quality input is handled safely.

## S02 — Channel3 product discovery

Work only within S02 ownership.

Integrate Channel3 using the currently documented REST API or TypeScript SDK 4.x. Before coding product cards, perform an authenticated live request and preserve a sanitized raw response fixture for tests. Use the US/USD/en locale and default search mode for demo predictability. Normalize the actual returned JSON, including optional fields and observed price shape. Do not assume all products have images, descriptions, variants or offers.

Product selection requires a current offer with product ID, title, merchant/domain, buy URL, valid positive price and currency. Refresh current product details/offers before selection and contract approval. Product IDs may be retained; do not show cached stale prices, offer URLs, availability, images or descriptions as current. A test fixture is not a user-facing fallback.

Use product listings as candidates only. Never claim Channel3 certifies compatibility or authenticity. If spare part coverage fails, execute the documented repair-versus-replace pivot or stop at the sponsor integration gate.

Own Channel3 adapter, normalized candidate contracts, search UI and tests. Do not own quote pricing or PayPal.

Acceptance expectation: live query, raw response validation, offer normalization, empty/error states, freshness controls and no fabricated results.

## S03 — Quotes and Repair Contracts

Work only within S03 ownership.

Implement three explicitly simulated repairer profiles, itemized quotes, quote comparison and a versioned customer-approved Repair Contract. Distinguish Channel3 retail reference price from repairer part charge and labour. Include scope, exclusions, warranty, turnaround, total and currency. Use integer minor units and deterministic arithmetic. The contract references the selected Channel3 product ID and selected offer snapshot for audit context, but the snapshot must not be reused as a current live product offer.

Create formal contract change requests with reason, before/after values, immutable version history and customer approval/rejection. If amount changes, call the S04 payment contract to void and reauthorize; do not implement PayPal calls inside S03. No repair may start until current contract is approved and payment is authorized.

Own quote/contract persistence, services, UI and tests. Do not edit Channel3 or PayPal adapters.

Acceptance expectation: exact totals, no hidden charges, stale contract rejection, change approval, concurrent update conflict handling and role/ownership checks.

## S04 — PayPal payment lifecycle

Work only within S04 ownership.

Implement the PayPal Orders v2 authorization flow using the PayPal JavaScript SDK Buttons with `intent=authorize`. Backend owns order creation, authorization, capture, void and reconciliation. Use one purchase unit, exact USD amount from the current approved contract, idempotency via `PayPal-Request-Id`, durable local operation record before outbound mutation and provider status reconciliation for unknown outcomes.

Do not call the product flow escrow or marketplace payout. The sandbox capture goes to the platform sandbox merchant, not the simulated repairer. The frontend must never call capture. `CAPTURED` requires confirmed provider capture completion. Handle buyer cancellation, authorization decline/expiry, amount mismatch, duplicate click, network timeout, unknown capture/void, `AUTH_CAPTURE_NOT_ENABLED` and provider 4xx/5xx.

Own payment adapter, payment state records, endpoints, SDK wiring and tests. Consume the approved contract amount/currency/version from S03. Do not implement contract business rules or evidence decisions.

Acceptance expectation: independently tested sandbox buyer approval → authorization → capture and authorization → void; no duplicate capture; unknown states never shown as success.

## S05 — Repair work and evidence

Work only within S05 ownership.

Implement the simulated repairer workbench, work status, installed-component declaration, before/after evidence assets and functional checklist for the selected repair category. Clearly label repairer identity and attestations as simulated. Enforce that work begins only after current contract approval and PayPal authorization.

Evidence categories: visual, component and functional. AI may check completeness and flag specific inconsistencies, but may not certify authenticity, compatibility, repair quality, customer acceptance or payment eligibility. A missing component label may be handled as technician-declared identity, clearly labelled. Keep evidence private and auditable.

Own repair job/evidence persistence, UI, AI completeness adapter and tests. Consume contract and payment read contracts; never call capture/void.

Acceptance expectation: upload and checklist flows; incomplete evidence blocked or flagged; AI provider failure does not prevent a human decision with a visible “AI check unavailable” state.

## S06 — Customer decision and Repair Passport

Work only within S06 ownership.

Implement the customer completion-review screen with approved contract snapshot, before/after images, component declaration, functional checks and advisory AI evidence flags. Provide explicit Accept, Request rework and Cancel choices; no default selection. Accept triggers S04 capture command only through the application orchestration contract. Request rework returns the job to repair without capture. Cancel requests S04 void; show cancelled only after confirmed void. Handle authorization expiry and unresolved provider operation.

After capture confirmation, render a Repair Passport containing device, contract version, Channel3 reference, simulated repairer declaration, evidence, tests, warranty, payment reference and timeline. Do not label the passport as OEM certification or a guarantee beyond the contract terms.

Own customer decisions, orchestration and passport read model/page. Do not implement PayPal HTTP calls or AI authority.

Acceptance expectation: accept/capture, reject/rework, cancel/void and failure paths all work; passport appears only after confirmed completion/capture.

## S07 — Integration, QA and submission

Work only within S07 ownership.

Compose already implemented domain contracts without absorbing missing features. Run full E2E flow, rejection/change flows, role checks, accessibility and responsive checks. Create deterministic demo reset/seed instructions, README, `.env.example`, verification log, test instructions, MIT license, under-three-minute demo script and submission checklist. A local working demo is acceptable; hosting is optional. Ensure all claims distinguish live API data, simulated repairer behavior and PayPal sandbox operations.

Do not manually alter payment state or fabricate Channel3 products. Do not add an unverified sponsor integration just to claim usage.

Acceptance expectation: fresh setup from README; one live Channel3 query, real sandbox authorization/capture, a customer rejection/void demonstration, all required automated checks passing and submission assets ready.
