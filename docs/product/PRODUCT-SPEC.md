# RepairRelay — Product Specification

**Version:** 1.0  
**Date:** 8 November 2026  
**Status:** Conditional GO; external API gates are mandatory  
**Product tagline:** Know what is quoted. Approve every change. Pay after proof.

## 1. Product definition

RepairRelay is an AI-assisted consumer electronics repair decision and transaction experience. It transforms a damaged-device request into a customer-approved repair agreement that references a discovered retail product, a repairer component attestation, an itemized quote, approved contract changes, completion evidence and a PayPal authorization that is captured only after explicit customer acceptance.

The product is not a repairer marketplace at launch. It is a coherent, demonstrable repair transaction with simulated repairer actors. It does not provide escrow, seller payouts, OEM certification, independent fitment certification, or a live technician network.

## 2. Problem statement

A consumer with a damaged device typically faces several disconnected decisions:

- What is visibly damaged, and what remains unknown until physical inspection?
- Which replacement components might fit this exact model?
- What is the difference between the retail part price, repairer part charge, labour, warranty and total?
- Will the repairer install the component the customer agreed to?
- What happens if the part or price changes?
- What evidence should be available before the customer accepts the work and pays?

RepairRelay connects these decisions into one traceable transaction. The core product value is not AI diagnosis alone; it is continuity between the proposed part, approved scope, delivered work and payment decision.

## 3. Target users and actors

### 3.1 Customer

A person who owns or is responsible for the damaged device. They create the request, choose among offers/quotes, authorize the payment, inspect evidence and decide whether to accept, request rework or cancel.

### 3.2 Simulated repairer

A seeded demo actor representing an independent repair professional. It reviews the device request, attests compatibility for the demo, submits an itemized quote, accepts the job, records installed component details, uploads evidence and can request a contract change.

The UI must display **SIMULATED REPAIRER** wherever a seeded repairer is presented. Never label the seeded actor as vetted, verified, certified or a real local provider.

### 3.3 Demo operator / judge

A person evaluating the working product. They must be able to follow the flow, understand what is real versus simulated, and observe live Channel3 data and real PayPal sandbox state transitions.

### 3.4 Administrator

A narrowly scoped demo operator with access to seeded data, transaction diagnostics and test resets. No broad admin control panel is required.

## 4. Product thesis and differentiation

### Primary differentiator

A **Parts-Referenced Repair Contract** binds:

1. the customer-selected device and repair request;
2. the selected Channel3 canonical product ID and the specific offer the customer saw;
3. a repairer attestation about suitability for the declared device;
4. the part charge, labour, warranty, turnaround and total;
5. immutable versions of any proposed/approved changes;
6. completion evidence and functional checks; and
7. customer acceptance/rejection and the corresponding PayPal outcome.

Channel3 discovery is not compatibility certification. A product listing is a candidate. Compatibility attestation is made by the simulated repairer in the demo, and must be labelled as simulated.

### Supporting features

- AI-assisted visual intake that separates visible observations from unknown internal faults.
- Live Channel3 product discovery, with a retail price reference and merchant link.
- Optional repair-versus-replace product comparison if spare-part coverage is weak.
- Itemized quotes, change requests and evidence-guided customer acceptance.
- Customer-controlled PayPal authorization/capture/void flow.
- A post-completion Repair Passport summarizing the transaction.

### Claims we must not make

Do not claim:
- the first AI repair marketplace;
- the first platform with verified repairers or escrow;
- that Channel3 confirms compatibility, stock, authenticity or quality;
- that AI verifies a repair or authorizes payment;
- that standard PayPal authorization is escrow;
- that the sandbox flow pays the repairer;
- that RepairRelay has real technicians, real geographic coverage or production readiness.

## 5. Initial market wedge

**Initial use case:** smartphone display replacement for one selected model, initially iPhone 13, using the US/English/USD Channel3 locale.

The model is a starting hypothesis, not a requirement to force a weak catalog match. The Day 1 feasibility gate determines the selected model/category.

### Channel3 pivot rule

1. Search iPhone 13 OLED replacement display assemblies.
2. Search a second wording for the same component.
3. Search an alternative model/category (e.g. Galaxy S23 display) and a second component (battery).
4. Require at least two distinct, relevant spare-part products with usable merchant offers to keep the parts-referenced demonstration.
5. If no suitable component category is supported, pivot the Channel3 feature to live replacement-device discovery and clearly call the flow **Repair-versus-Replace**. Do not continue claiming the contract references a repair part.
6. If neither spare parts nor relevant replacement devices are returned, stop product build work that depends on Channel3 and resolve API access/catalog issues with the sponsor.

## 6. Core product principles and invariants

1. AI diagnosis is advisory; physical inspection may change the assessment.
2. No arbitrary confidence percentages. Use `LOW`, `MEDIUM`, `HIGH` only if the model's classification is supported by configured prompt guidance; otherwise show `UNASSESSED`.
3. Distinguish visible damage, suspected causes and unknowns.
4. Channel3 products are candidates, not proof of fitment or authenticity.
5. In the demo, repairer compatibility statements are simulated attestations.
6. A quote cannot bind to a product without a valid current offer and usable price/URL at selection time.
7. Retail offer price is not automatically the repairer's part charge. These are separately labelled amounts.
8. The customer must approve the complete quote before repair begins.
9. The repairer cannot silently substitute a part, scope, warranty or price.
10. Every contract change creates a new immutable version and requires customer approval.
11. The original contract and earlier approvals remain readable in history.
12. PayPal buyer approval and authorization occur before the simulated repair starts.
13. Payment capture occurs only after an authenticated customer explicitly accepts the submitted work.
14. AI never decides compatibility, repair quality, acceptance, capture, void or refund.
15. Customer rejection never causes capture.
16. Customer may request rework or cancel. Cancellation requires a confirmed PayPal void when an uncaptured authorization exists.
17. If amount changes, the old authorization is voided and a new buyer-approved authorization is created for the new amount.
18. One PayPal purchase unit per order for this MVP.
19. Payment operations are idempotent and reconcile uncertain outcomes before retrying.
20. Store PayPal business state and raw provider state separately; preserve unknown provider statuses.
21. No escrow, marketplace disbursement or repairer payout is implemented.
22. No stale Channel3 prices, offer URLs, availability, images or descriptions are shown as current. Product IDs may be retained; refresh current offers before display/selection.
23. The user-facing UI must disclose simulated repairers and sandbox payment use.
24. No payment card data is collected or stored by RepairRelay.

## 7. MVP scope

### In scope

- Single demo organization/application, one locale (US/en/USD), one selected device per repair request.
- Customer login and simulated repairer login using seeded demo accounts.
- Device model selection and symptom text.
- Private image upload and vision-assisted diagnosis.
- Live Channel3 search and offer normalization.
- Product candidate selection; current offer refresh before selection.
- Three seeded simulated repairers and itemized quotes.
- Quote comparison and customer-selected quote.
- Versioned Repair Contract with part, labour, warranty, scope and total.
- Formal change request and reapproval.
- PayPal JS SDK buyer approval and standard authorization.
- Simulated repairer job progression and evidence submission.
- Evidence review with AI completeness flags and functional checklist.
- Customer accept, request rework or cancel.
- Real PayPal capture or void in sandbox.
- Repair Passport / transaction summary.
- Audit timeline and clear error/empty/loading states.
- Automated tests, README, `.env.example`, demo script and verification log.

### Explicitly out of scope

- Real technician recruitment, background checks, reputation or marketplace onboarding.
- Live technician location, scheduling, routing or service-area search.
- Repairer payouts, marketplace split payments, escrow or delayed disbursement.
- Production payments, real customer money or customer card handling.
- India domestic PayPal payment support or INR checkout.
- Channel3 checkout or in-app merchant checkout.
- Independent OEM authentication or compatibility verification.
- AI-only quality approval, fraud scoring or automatic charge decisions.
- Multi-device repair orders, multiple purchase units, multiple currencies.
- Full disputes/arbitration, refunds after capture, chargebacks, warranties enforcement.
- Native mobile apps, push notifications, email/SMS delivery dependency.
- Redis, background queue, microservices or unnecessary cloud infrastructure.
- AG Grid, MCP, or another sponsor integration unless it adds clear value after the core flow works.

## 8. Primary user journey

1. Customer signs into seeded demo account.
2. Customer creates repair request with device model, symptoms and photos.
3. AI returns structured observations, likely repair category, uncertainty and follow-up questions.
4. Customer reviews/edits model and symptoms; AI output is not silently treated as fact.
5. Customer requests Channel3 product discovery.
6. UI shows live product candidates and merchant offers, freshness timestamp, listing caveats and external merchant links.
7. Customer selects a product candidate.
8. Simulated repairers attest compatibility and submit quotes.
9. Customer compares the part reference, part charge, labour, warranty, turnaround and total.
10. Customer selects a quote and approves the complete contract.
11. PayPal SDK buyer approval occurs; backend authorizes the single purchase-unit order.
12. Job enters repair in progress.
13. Simulated repairer submits installed-part declaration, visual evidence and functional check results.
14. Customer reviews the evidence and AI completeness flags.
15. Customer accepts, requests rework or cancels.
16. Accept → backend captures authorization; cancel → backend voids authorization; rework → no capture and another evidence cycle.
17. Repair Passport is available after confirmed capture and completion.

## 9. Business rules by domain

### Repair intake

- Device brand/model must be selected from an MVP-controlled catalog or entered as a clearly unverified model string.
- If model is unknown, permit intake but do not perform exact model-specific part search.
- Image uploads: JPEG, PNG or WebP, maximum 8 MB each, maximum 4 images per request for MVP.
- Reject SVG, HTML, executable, animated, oversized and unsupported files.
- Re-encode raster images and strip EXIF metadata before storage/AI processing.
- Store private asset references, not public raw paths.

### AI diagnosis

- Output must conform to a strict Zod schema.
- Include source-grounded visible observations.
- Internal fault causes must be marked suspected/unknown.
- If image quality is poor, say that diagnosis is inconclusive and ask for another angle or symptom details.
- If image is unrelated, do not invent a device or fault.
- The customer can correct device metadata and symptom description.
- Diagnosis generation failure must not destroy intake; allow retry and manual repair category selection.

### Channel3 product discovery

- Server-only API calls.
- US locale, USD, English for the initial demo.
- Default search mode for predictable demo latency.
- Parse actual live JSON and normalize optional/missing values.
- Support documented price schema variation (`price.price` or `price.amount`) only after verifying actual response; reject unknown/currency-mismatched price formats.
- Product candidate requires product ID and title to display; selection requires at least one offer with current URL, domain and positive finite price/currency.
- Refresh current product details/offer before displaying or accepting a selection.
- Never infer compatibility from search relevance or image similarity.
- Do not cache stale offer prices, availability, images, descriptions or URLs. Saved responses may be used only for automated tests, not as a user-facing fallback.
- On timeout, 429, 5xx or malformed response, show a recoverable error and retry action; do not show stale prices as current.

### Quotes and contract

- The selected Channel3 retail offer is a reference to the candidate listing. Repairer quote records their separate part charge and labour.
- Each quote is a fixed, versioned snapshot for the displayed validity window.
- Currency must be USD in MVP.
- Decimal-safe money conversion; store minor units as integer.
- Total = part charge + labour + any explicitly disclosed fees/tax. No hidden charges.
- No negative amounts; zero labour is permitted only if explicitly labelled included/waived.
- Warranty must specify duration or `NONE`; do not imply warranty from merchant listing.
- Quote must include repair scope, expected duration and exclusions.
- Contract has one selected quote and one purchase total.
- A change request requires a reason, before/after values and explicit customer decision.
- Customer rejection of a proposed change preserves current approved contract; the repairer must continue under original contract or request cancellation.

### Payment

- PayPal Orders API v2 with intent `AUTHORIZE`.
- Exactly one purchase unit.
- Frontend uses PayPal JS SDK Buttons; all order create/authorize/capture/void mutations occur server-side.
- Use `PayPal-Request-Id` for supported POST mutations.
- Persist local payment attempt and idempotency key before outbound mutation.
- Unknown outcome after network timeout is reconciled before any retry.
- Store PayPal order ID, authorization ID, capture ID and raw status; do not store credentials or card data.
- `CAPTURED` only after confirmed provider capture `COMPLETED`.
- Authorization amount/currency must exactly match currently approved contract.
- Same authorization cannot be assumed valid after expiry/void; new buyer approval is required.
- Standard authorization is not escrow and does not pay the simulated repairer.

### Evidence and customer decision

- Require at least one before image, one after image, installed component declaration and completed functional checklist for the demo's selected repair type.
- Component photo/label can be optional if no packaging/label exists, but then the UI must say component identity is technician-declared rather than photo-verified.
- The app cannot infer authenticity or exact fitment from a photo.
- AI may flag missing evidence, low image quality or inconsistency with the chosen repair category.
- AI output is advisory and must show rationale / specific evidence item.
- Customer decision is explicit, authenticated and recorded with timestamp and contract version.
- Rework path may be used once in the demo; avoid infinite loop. Product model can support repeated rework within a configured limit.

## 10. Success metrics for the demo

These are product/demo metrics, not validated production KPIs:

- A judge can complete the main journey in under 3 minutes.
- At least one live Channel3 search is visible and returns actual results.
- Selected product ID and current offer are referenced in the approved contract.
- Repairer simulation label is always visible.
- Change request demonstrates versioning and customer approval.
- PayPal status visibly changes from `AUTHORIZED` to `CAPTURED` only after customer acceptance.
- Rejection demo proves no capture occurs.
- There are no manually edited database statuses or hard-coded payment success screens.

## 11. Release gates

- Gate G0: authenticated Channel3 key can return product search JSON; schema captured and parsed.
- Gate G1: at least two relevant priced spare part offers for a repair category, or approved fallback to repair-versus-replace.
- Gate G2: PayPal sandbox merchant supports AUTHORIZE and completes buyer approval → authorize → capture.
- Gate G3: authorization can be voided; change/rejection paths verified.
- Gate G4: AI provider accepts image input and returns valid structured JSON.
- Gate G5: all payment lifecycle and edge tests pass; live demo reset is repeatable.
- Gate G6: submission assets and repository meet current official rules.

No claim of completion may be made while a gate is blocked. Record the exact blocker and fallback decision.
