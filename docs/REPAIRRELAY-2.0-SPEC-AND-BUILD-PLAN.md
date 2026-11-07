# RepairRelay 2.0 — Final Product Specification, Agent Brief and Five-Day Build Plan

**Version:** 1.0  
**Prepared:** 8 November 2026 (IST)  
**Hackathon:** PayPal AI Hackathon 2026  
**Product:** RepairRelay  
**Tagline:** Know what is quoted. Approve every change. Pay after proof.  
**Primary sponsor target:** Best Use of Channel3 ($1,500)  
**Secondary target:** Best Use of PayPal + AI; Best Demo Delivery; overall judging categories  
**Submission deadline:** 12 November 2026, 12:00 PM Pacific Standard Time = 13 November 2026, 1:30 AM India Standard Time.

> **Decision:** Conditional GO. The product and implementation brief are ready. Feature coding is blocked until the live Channel3 spare-part search, PayPal sandbox authorize/capture/void cycle, and multimodal AI provider are verified with the entrant's own credentials.

---

# Part A — Product decision and boundaries

## 1. Final product definition

RepairRelay is an AI-assisted repair decision and transaction experience for consumer electronics. It turns a damaged-device request into a customer-approved repair contract that references a specific retail product listing, a repairer-attested component choice, an itemized repair quote, completion evidence and a PayPal payment authorization that is captured only after explicit customer acceptance.

The central mechanism is a **Parts-Referenced Repair Contract**. It links:

1. the customer's exact device model and AI-assisted fault assessment;
2. a Channel3 canonical product ID and a specific merchant offer observed at selection time;
3. the simulated repairer's component-compatibility attestation;
4. the agreed part charge, labour, warranty and total;
5. any customer-approved contract changes;
6. before/after and component evidence plus functional checks; and
7. the customer's explicit acceptance or rejection and the resulting PayPal state.

The contract is a traceable agreement record, not a legal escrow arrangement, proof of OEM authenticity, a compatibility certificate or a marketplace settlement service.

## 2. One-sentence pitch

**RepairRelay helps consumers make a confident repair decision by connecting live parts discovery, an itemized repair agreement, documented completion evidence and customer-approved PayPal capture.**

## 3. Problem and target users

### Customer

A consumer with a damaged phone does not know which component is appropriate, whether the quoted part is the one that will be installed, whether labour and warranty are fairly described, or what happens if the repairer changes the plan.

### Repairer

An independent repair professional needs a structured request, clear device information, a defined component reference and an explicit way to propose changes before continuing work.

### Hackathon demo operator / judge

Needs to see real AI output, live Channel3 calls, a coherent customer journey and an actual PayPal sandbox authorization/capture—not a static prototype or hard-coded green payment state.

**Demo disclosure:** repairer profiles and repairer attestations are simulated seed data. Do not call them vetted, verified or real technicians.

## 4. Competitive positioning and honest novelty claim

Do not claim that RepairRelay is the first AI repair app, first repair marketplace, first verified-repairer service or first platform to delay payment until completion. Existing products cover parts of that workflow.

The defensible positioning is the **differentiated combination of parts-reference traceability, customer-approved contract changes, completion evidence and a human-controlled payment state transition**.

### What makes the demo distinct

- A quote is tied to a selected Channel3 product and merchant offer, not merely “screen repair”.
- A repairer must attest whether the candidate component is suitable for the user-selected device. In this demo the attestation is explicitly simulated.
- A component or price substitution creates a versioned change request; the original agreement remains in history.
- Completion requires evidence categories: visual, component and functional checks.
- AI can classify visible damage and flag missing/inconsistent evidence, but cannot decide compatibility, accept work, authorize payment or capture money.
- PayPal changes visibly from `AUTHORIZED` to `CAPTURED` only after customer acceptance.

## 5. Initial wedge and demo market

**Primary wedge:** smartphone display replacement for a single, explicitly selected device model, initially Apple iPhone 13 if the Channel3 feasibility gate passes.

**Demo locale:** `US / USD / en`. Channel3's documented supported-market list does not include India. The app is a US-locale product-data demonstration with simulated repairers; it is not a live US marketplace. PayPal sandbox test accounts demonstrate the payment lifecycle. No production-country availability claim is made.

**Fallback order if iPhone 13 parts coverage fails:**

1. Test the second device/category in the feasibility matrix (e.g. Galaxy S23 OLED assembly).
2. Test another repairable component category where the live Channel3 catalog returns genuine parts with usable priced offers.
3. Only if no useful replacement-component results exist, switch to the explicitly named **Repair-versus-Replace mode**. In this fallback, Channel3 is used for current replacement-device product comparisons; RepairRelay must stop claiming a parts-referenced Channel3 contract. Preserve the human-approved repair contract and PayPal completion-payment demonstration.

Do not invent results or populate live product cards from fabricated seed listings.

## 6. Product principles — non-negotiable

1. The user selects the canonical device model; AI does not infer exact model identity from the photograph.
2. AI diagnosis is advisory and identifies visible observations, likely repair category, confidence band and unknowns.
3. Channel3 product discovery is not compatibility certification.
4. A product candidate is not a confirmed part until the repairer attests compatibility; in the demo that attestation is labelled **Simulated**.
5. Merchant offer price is a retail reference. It is not automatically the repairer's part charge or proof that the repairer purchased that exact listing.
6. The repair quotation clearly separates referenced listing price from repairer-supplied part charge and labour.
7. Every material change to component, scope, warranty or total requires customer approval before proceeding.
8. Payment authorization is not escrow and does not pay the repairer.
9. Customer acceptance—not AI or repairer status—triggers capture.
10. Customer rejection never triggers capture. It leads to rework or an uncaptured authorization void.
11. A change to total price requires a new buyer-approved authorization after the old authorization is confirmed void.
12. No partial capture, split tender, automatic tip or automatic price increase in the MVP.
13. No live marketplace onboarding, seller payout or dispute adjudication.
14. Preserve immutable contract versions and an append-only audit timeline.
15. Do not display stale Channel3 offer prices, availability or URLs as current.
16. All demo repairers, quotes and test data are visibly marked simulated/illustrative.
17. Never show “Paid”, “Captured” or “Completed” until the corresponding external PayPal response confirms it.

## 7. MVP scope

### In scope

- One customer demo role and one simulated-repairer demo role, plus optional admin/demo operator.
- One target device model and one repair category for the main demo.
- Private image upload for damaged device and repair evidence.
- Multimodal diagnosis with validated structured output.
- Live Channel3 `/v1/search`, product cards and retailer offer links.
- Product/offer refresh before display and selection.
- Three seeded simulated repairer quotes, each referencing the same selected candidate when doing a fair comparison.
- Immutable repair contract snapshot, customer approval and contract change request.
- PayPal JavaScript SDK buyer approval, Orders v2 authorization, Payments v2 capture and void.
- Evidence submission, functional-test checklist, customer acceptance, rework and cancellation.
- Repair Passport / transaction timeline.
- A clear demo mode and setup/run documentation.

### Explicitly out of scope

- Real technician onboarding, background checks, location matching or dispatch.
- Real part purchasing or Channel3 checkout.
- Integrated retailer checkout or procurement.
- Real marketplace seller payout, delayed disbursement, escrow or split settlement.
- Production US or India launch, local tax compliance, warranty enforcement or legal dispute resolution.
- Real customer money or live production PayPal transactions.
- AI-certified part compatibility, authenticity detection or quality grading.
- Automated AI repair acceptance or payment capture.
- Native mobile apps, chat/messaging, ratings/reviews, subscriptions, price alerts, inventory management or repair-shop ERP.
- AG Studio, MCP, Render Workflows or other extra sponsor integrations unless all P0/P1 acceptance criteria already pass.

---

# Part B — End-to-end product workflow

## 8. Main customer-to-repair transaction

### Step 1 — Create repair request

Customer selects the device make/model, describes symptoms and uploads one or more images. The initial demo should require one clear device-damage image, with optional additional angle.

### Step 2 — AI diagnosis

A vision-capable model returns structured observations, likely component category, confidence band (`LOW`, `MEDIUM`, `HIGH`), unknowns and suggested physical checks. It must not invent a calibrated percentage or claim to see internal faults that are not visible.

Example:

```json
{
  "deviceModel": "Apple iPhone 13",
  "observations": [
    "Visible fracture lines across the front display",
    "No reliable evidence about touch response from the image"
  ],
  "suspectedComponent": "display_assembly",
  "likelyRepair": "display_replacement_assessment",
  "confidenceBand": "HIGH",
  "unknowns": ["touch_functionality", "underlying_display_damage"],
  "technicianChecks": ["test touch response", "inspect frame and connector area"]
}
```

This is an illustrative schema, not a diagnosis claim. The customer confirms or edits the device model and symptoms.

### Step 3 — Channel3 candidate discovery

The backend searches for relevant replacement components using the selected device model and repair category. The UI displays current product candidates with images, title, merchant offers, price/currency, availability and condition when returned.

A customer chooses a candidate product and one current merchant offer as the reference. The UI states: “Candidate product listing — compatibility must be confirmed by the repairer.”

### Step 4 — Simulated repairer review and quote

Three simulated repairers review the structured request and candidate listing. Each submits:

- simulated repairer name and badge;
- compatibility attestation (`CONFIRMED_FOR_DEMO`, `NOT_CONFIRMED`, `REJECTED`);
- component reference (Channel3 product ID + merchant domain/offer observed at selection time);
- repairer-supplied part charge (separate from the retailer's displayed reference price);
- labour charge;
- total amount in USD minor units;
- warranty duration and exclusions;
- estimated turnaround; and
- quote expiry.

Only quotes with a positive total, same currency, valid component reference and simulated compatibility attestation are selectable in the main flow. Do not label this as real-world verification.

### Step 5 — Customer selects a quote and approves the Repair Contract

The contract summarizes the selected repairer, part reference, merchant domain, reference price timestamp, repairer-supplied part charge, labour, total, warranty, exclusions and estimated turnaround. Customer explicitly approves the terms.

The contract version is immutable. The customer cannot pay an amount different from its total.

### Step 6 — PayPal buyer approval and authorization

The app renders PayPal JavaScript SDK Buttons configured for `intent=authorize` and USD. `createOrder` calls the backend. The customer approves using a PayPal sandbox buyer login. `onApprove` calls the backend to authorize the order. The backend stores the PayPal order ID and authorization ID and marks the payment `AUTHORIZED` only after a successful PayPal response.

The customer is told funds are authorized/held, not captured or paid to the repairer.

### Step 7 — Simulated repairer executes and submits evidence

The simulated repairer view shows the approved job and exact contract version. It provides:

- before photo;
- after photo;
- component label/packaging/part identification photo or declared identifier;
- functional checks (e.g. display image, touch response, brightness, proximity sensor where appropriate); and
- a short repair completion note.

The UI prominently labels the user as a simulated repairer.

### Step 8 — Customer reviews evidence

The customer sees the original contract, submitted evidence, functional checklist and AI evidence completeness flags.

Customer actions:

- **Accept repair** — explicit human acceptance; enables capture.
- **Request rework** — captures nothing; sends a reason back to the repairer and leaves the authorization active if still valid.
- **Cancel repair** — captures nothing; backend voids the authorization and reports `CANCELLED` only after a confirmed void.

The AI may show missing/unclear evidence, but may not preselect acceptance or invoke capture.

### Step 9 — PayPal capture or void

On acceptance, the backend verifies all invariants and captures the authorization. `CAPTURED` requires a PayPal capture resource with a success status (`COMPLETED`). If capture is pending or ambiguous, the UI displays pending/unknown and reconciliation is required.

On cancellation, the backend voids the authorization. `VOIDED` requires a confirmed PayPal void response. A voided authorization can never be captured.

### Step 10 — Repair Passport

The completed record shows the immutable contract version, referenced component, simulated compatibility attestation, approved changes, evidence assets, functional tests, customer decision and PayPal capture/void status. Historical listing prices are labelled “observed at contract approval”; they are not presented as current retailer offers. Current offers must be re-fetched from Channel3 before showing a current buy link or price.

---

# Part C — Change, rejection and failure workflows

## 9. Component or price substitution

A simulated repairer may create a change request only while the repair is in progress and before final evidence submission.

Required fields: reason, proposed replacement Channel3 product ID (if applicable), proposed merchant offer reference, revised part charge, revised labour/total, revised warranty and turnaround, and an explanation.

Rules:

- The original contract remains immutable.
- A new proposed version is created; it is not silently written over the original.
- The request pauses work until the customer decides.
- The customer may approve the change or reject it.
- If rejected, the repairer must either continue the original agreed work or the customer may cancel. Never auto-cancel without an explicit choice.
- If the total changes, void the old authorization first, confirm the void, create a new PayPal order for the revised total, obtain buyer approval and create a new authorization. Do not authorize a higher amount against the old order.
- If the total is unchanged but the component/scope materially changes, the customer must approve the new contract version. Re-check that the existing authorization amount and currency still match the new total before continuing.
- If void outcome is unknown, block creation of a replacement authorization until the old authorization is reconciled.

## 10. Customer rejection and rework

- `REQUEST_REWORK`: no capture; keep the authorization only while PayPal reports it valid; repairer can resubmit evidence.
- `CANCEL_REPAIR`: no capture; void authorization; mark cancellation only after confirmed void.
- If authorization expires or is no longer valid before rework acceptance, require a new buyer approval/authorization before continuing to completion.
- One rework cycle must be demonstrated. A production dispute process is out of scope.
- Partial acceptance/partial capture is out of scope.

## 11. Payment and dependency failure handling

- Channel3 timeout: preserve the repair request, display retry; do not manufacture listings.
- Channel3 zero results: display empty state and offer a new query/model; fallback gate applies.
- Product with no usable merchant offer: informational only; cannot bind to a priced contract.
- PayPal buyer cancels: return to the contract with `APPROVAL_CANCELLED`; no authorization exists.
- Authorization decline/error: repair does not begin.
- Authorization API timeout: set `AUTHORIZATION_UNKNOWN`; query order/authorization state before retrying.
- Capture timeout: set `CAPTURE_UNKNOWN`; query authorization/capture resource and reconcile before issuing another capture.
- Capture `PENDING`: do not mark paid/completed; continue status reconciliation.
- Capture `DECLINED`/failure: show a failure state and recovery; never set `CAPTURED`.
- Void timeout: set `VOID_UNKNOWN`; retrieve authorization details before any replacement order or cancelled state.
- Authorization expired: no capture; require a fresh buyer authorization if the repair is to continue.
- AI timeout/invalid JSON: no fabricated diagnosis or evidence result; retry once if safe, then show “AI analysis unavailable” with manual path.
- Image upload failure/invalid MIME/oversize: retain the draft, explain the issue and allow retry.

---

# Part D — Architecture and data contracts

## 12. Recommended technology stack

Use the same low-operations, TypeScript-first style as the FamilyLedger brief unless the existing repository already establishes a different sound stack.

| Layer | Recommendation | Reason |
|---|---|---|
| App | Next.js App Router + TypeScript | One deployable app; frontend and server routes together |
| UI | Tailwind CSS + shadcn/ui + Lucide | Fast coherent product UI and accessible primitives |
| API validation | Zod | Validate all client, AI and external API inputs |
| Database | PostgreSQL | Transactions, unique constraints and relational integrity |
| ORM | Prisma | Rapid schema/migration workflow |
| Auth | Auth.js Credentials with seeded demo roles | No external identity provider required for a private demo |
| AI | Vision-capable API behind a provider adapter | Keep model choice replaceable; require image input + structured JSON |
| Product discovery | Channel3 `/v1/search`, server-side | Real sponsor API usage and product/offer results |
| Payment | PayPal Orders v2 + Payments v2 | Buyer approval, authorize, capture and void |
| File handling | Local private storage for local demo behind a storage adapter | Avoid adding a third-party storage dependency to the critical path |
| Image processing | `sharp` | Re-encode images and strip metadata |
| Tests | Vitest + Playwright | Unit/integration/E2E verification |
| Deploy | Local demo is acceptable; optional Render/Vercel + persistent/object storage | Do not risk a late hosting dependency |

No Redis, BullMQ, microservices, external email delivery, marketplace payout, native mobile app or sponsor UI framework until the critical flow works.

## 13. Core data concepts

- `User` and `DemoRole`
- `RepairRequest`
- `UploadedAsset`
- `DiagnosisReport`
- `ProductSearchRun`
- `ProductReference` (Channel3 product ID and minimal transaction snapshot)
- `RepairQuote` and `QuoteLineItem`
- `RepairContract` and immutable `ContractVersion`
- `ContractChangeRequest`
- `RepairJob`
- `EvidenceSubmission`, `EvidenceAsset`, `FunctionalCheck`
- `PaymentAttempt`, `PaymentEvent`
- `AuditEvent`
- read-only `RepairPassport` projection

Full field guidance and ownership is in `DATA-MODEL-AND-STATE-MACHINES.md`.

## 14. Architectural invariants

1. Money is integer minor units (`amountMinor`) in persistence. Convert to PayPal decimal strings only at the API boundary.
2. Currency is USD in the hackathon MVP; no FX or mixed-currency calculations.
3. The selected repair contract version determines the exact authorization amount and currency.
4. PayPal order ID, authorization ID and capture ID are stored separately and uniquely where possible.
5. At most one active authorization is associated with the current contract version.
6. Capture precondition: correct customer, approved current contract, required evidence submitted, explicit acceptance, authorization still valid, amount/currency match, no pending change request, no prior capture.
7. Void precondition: uncaptured active authorization; void is never treated as a refund.
8. After capture, cancellation requires a refund process; automated refunds are out of scope. Do not attempt to void a captured payment.
9. External API timeouts create an unknown state, not a failure or success assumption.
10. Use PayPal `PayPal-Request-Id` and app-side idempotency keys for mutations.
11. Use database transactions/conditional updates to prevent simultaneous accept/reject/capture or duplicate change approval.
12. All contract versions and audit events are append-only from application code.
13. Product IDs may be stored for later refresh. Retailer price, availability, images and offers are unstable; refresh before displaying. A minimal immutable price/merchant snapshot may be retained as part of the specific approved contract record, not served as a current listing.
14. External credentials never reach the browser or logs.
15. Uploaded device/evidence images are private and access-controlled.

---

# Part E — Implementation slices and five-day schedule

## 15. Correct implementation order

The strict sequence is:

`S0 Feasibility → S1 Foundation → S2 Image intake/AI → S3 Channel3 discovery → S4 Simulated quotes → S5 Repair Contract/change request → S6 PayPal approval/authorization → S7 Repairer evidence → S8 Customer decision/rework/cancel → S9 PayPal capture/void/reconciliation → S10 Repair Passport → S11 hardening/submission`.

The PayPal authorize/capture/void API must be proven in S0 before the UI depends on it; its product integration is implemented later, after the approved contract exists.

Detailed tasks and exit criteria are in `docs/plan/IMPLEMENTATION-SLICES.md`.

## 16. Calendar plan

| Date (IST) | Primary objective | Must be true before moving on |
|---|---|---|
| Nov 8 | P0 feasibility: Channel3, PayPal, AI; initialize repo and data contracts | All three gates pass or explicit pivot selected |
| Nov 9 | Foundation, auth, private image upload, diagnosis | One uploaded image produces validated structured diagnosis |
| Nov 10 | Channel3 live search, offer normalization, quote comparison | Real product/offer data shown; 3 quotes are visibly simulated |
| Nov 11 | Repair Contract, change request, PayPal buyer approval/authorization, evidence and customer review | Contract-bound PayPal authorization; rework/cancel paths work |
| Nov 12 | Capture/void/reconciliation, Repair Passport, E2E, README, public repo, recording and submission | Real end-to-end sandbox demo; submission completed before cutoff |

**Deadline buffer:** target Devpost submission by 11:00 PM IST on 12 November. Absolute deadline is 1:30 AM IST on 13 November. Do not leave the submission form or upload for the final minutes.

## 17. What to cut if time is short

Cut in this order: animated transitions → admin analytics → multiple repair categories → second/third rework → AI evidence vision analysis beyond completeness → deployment polish → Repair Passport styling.

Never cut: real Channel3 search, real PayPal buyer approval/authorization/capture, customer acceptance gate, cancellation/void state, simulated-data labels, basic error handling, or functional demo instructions.

---

# Part F — Quality and hackathon submission

## 18. Quality gates

- P0 external API tests pass.
- Unit tests validate money, price normalization, diagnosis schema and state transitions.
- Integration tests cover Channel3 empty/missing-offer/error responses and PayPal success/declined/timeout/unknown paths.
- Playwright tests cover the happy path, part substitution, customer rework and customer cancellation.
- No client can invoke capture directly without server-side state checks.
- No stale Channel3 offer is displayed after a search error.
- No test/mock result is presented as live.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass.
- Demo account credentials are provided safely in the judge instructions; no API secrets are committed.

## 19. Submission requirements verified on 8 November 2026

Official Devpost rules require:

- PayPal developer-platform sandbox integration and a meaningful AI tool/model/platform.
- A functional demo. It may be hosted or judges may run the app from complete repository setup instructions; a static mockup is not acceptable.
- Public code repository (GitHub, GitLab or Bitbucket) with all source, assets and instructions.
- An open-source license file visibly present at repository top level.
- A public YouTube demo video under three minutes that shows the application actually functioning.
- Submission materials in English, or English translation.
- Testing access and credentials/instructions as needed.
- Video must not include third-party trademarks or copyrighted music/material unless permission is held.

The official rules list equally weighted judging dimensions: technological implementation, design, potential impact, innovation/idea and presentation. The Channel3 sponsor requirement says the API or MCP must be a meaningful part of the product experience; merely mentioning Channel3 does not qualify. The API path is sufficient; do not claim MCP usage unless it is implemented.

Sources: [Official rules](https://paypalaihackathon.devpost.com/rules), [Channel3 sponsor challenge](https://paypalaihackathon.devpost.com/details/channel3), [Hackathon overview](https://paypalaihackathon.devpost.com/).

## 20. Final coding-agent instruction

You are implementing RepairRelay in the existing repository. Read this master document and all linked documents before editing code. First inspect the repository; do not overwrite established decisions or perform a broad rewrite. Run S0 feasibility checks before feature work. Implement one vertical slice at a time in the stated order. Use actual external API responses to finalize runtime schemas. Do not make up Channel3 products, PayPal states, AI outputs, repairer verification or test results. Treat unknown external outcomes as `UNKNOWN` and reconcile them. Add tests with each slice. Update `docs/VERIFICATION-LOG.md` with real commands and outcomes. Never mark a slice complete until its acceptance criteria and tests pass.

---

# Official integration references

## Channel3

- [Make a Search](https://channel3.ai/docs/guides/make-a-search)
- [Search Response](https://channel3.ai/docs/guides/response-overview)
- [Offer](https://channel3.ai/docs/guides/offer)
- [Set Locale](https://channel3.ai/docs/guides/locale)
- [Caching Best Practices](https://channel3.ai/docs/guides/caching)
- [Pricing](https://channel3.ai/docs/pricing)
- [Rate Limits](https://channel3.ai/docs/faq/rate-limits)
- [Official Channel3 API skill / SDK 4.x quick start](https://github.com/channel3-ai/skills/blob/main/skills/channel3-api/SKILL.md)
- [Channel3 developer portal](https://trychannel3.com/developers)

## PayPal

- [Authorize and capture later](https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture/)
- [Orders API integration](https://developer.paypal.com/api/rest/integration/orders-api)
- [Payments v2 endpoints](https://developer.paypal.com/api/payments/v2)
- [Void authorized payment](https://developer.paypal.com/api/payments/v2/authorizations-void/)
- [PayPal REST API requests and idempotency](https://developer.paypal.com/api/make-api-requests/)
- [PayPal India domestic payments](https://www.paypal.com/in/cshelp/article/can-i-use-paypal-to-receive-payments-from-indian-customers-help1049)

**Documentation review date:** 8 November 2026. External schemas can change; re-check the linked official docs before implementing or updating a dependency.
