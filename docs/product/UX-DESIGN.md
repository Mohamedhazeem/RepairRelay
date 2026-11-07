# RepairRelay — UX and Visual Design Specification

**Visual direction:** premium consumer fintech + repair service workflow. Calm, precise, reassuring and evidence-led. The interface should feel like a serious transaction product, not a generic chatbot, ecommerce clone or repair shop admin template.

## 1. Design principles

1. Make the next decision obvious; one primary action per screen.
2. Keep product evidence, quote terms and payment status visible at the point of decision.
3. Distinguish observed, AI-inferred, repairer-declared and customer-approved information.
4. Always identify simulated actors and sandbox actions.
5. Avoid false trust signals: no fake verified badges, ratings or technician credentials.
6. Prefer clear statuses and timelines over celebratory animations.
7. Use progressive disclosure for technical details without hiding price, scope or risk.
8. Build responsive-first and keyboard-accessible flows.

## 2. Brand and visual system

### Identity

- Name: RepairRelay.
- Descriptor: Parts-Referenced Repair Transactions.
- Tagline: Know what is quoted. Approve every change. Pay after proof.
- Brand idea: a connected repair journey; do not use literal shield/checkmark clichés as the only identity.

### Palette

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F5F7FA` | Main app background |
| `surface` | `#FFFFFF` | Cards and forms |
| `ink` | `#152238` | Main text / navy |
| `muted` | `#66758A` | Secondary text |
| `line` | `#E3E8EF` | Borders / dividers |
| `brand` | `#0F766E` | Primary action / teal |
| `brand-soft` | `#E7F5F2` | Subtle accent backgrounds |
| `success` | `#15803D` | Confirmed success only |
| `warning` | `#B45309` | Waiting / change / caution |
| `danger` | `#B91C1C` | Rejection / failed / destructive |
| `info` | `#1D4ED8` | Informational and AI assistance |

Use color plus icon and text; never communicate payment or evidence status by color alone. Maintain WCAG 2.2 AA contrast.

### Typography and layout

- Font: Inter or a system sans-serif fallback.
- Body: 14–16 px; helper text 12–13 px; page title 28–32 px; section title 18–22 px.
- 8 px spacing scale; page content max width 1200–1280 px.
- Desktop: 12-column grid; main content 8 columns + contextual summary 4 columns where appropriate.
- Mobile: single column; sticky action bar only when it does not obscure content.
- Card radius 14–16 px; input/button radius 10–12 px; subtle border; minimal shadow.
- Avoid heavy gradients, glassmorphism, oversized hero banners and unnecessary charts.

### Motion

- 120–180 ms transitions for hover/focus and disclosure.
- Respect `prefers-reduced-motion`.
- No confetti for money or repair acceptance.
- Use skeleton loaders for product results and evidence panels; retain layout stability.

## 3. Global application shell

### Desktop

- Top bar: logo, `Demo environment` indicator, user role/name, help/menu.
- Left navigation (compact): Overview, Repairs, Activity, Demo guide.
- Main content area with page title, context and action.
- Right contextual panel only on screens where it adds clarity (repair summary, contract total, payment state).

### Mobile

- Top app bar with logo and status indicator.
- Bottom navigation or compact menu for Overview / Repairs / Account.
- Forms and cards full-width.
- Critical payment and customer decision actions fixed only if the full context remains reachable.

### Persistent disclosures

- A clear `SANDBOX` label on every payment-related screen.
- A `SIMULATED REPAIRER` label on quote and repairer screens.
- `AI-assisted — review before proceeding` on diagnosis/evidence.
- External merchant links open in a new tab with an external-link indication.

## 4. Screens and routes

Route names may be adjusted to the repository, but page responsibilities must remain.

### Screen 1 — Overview / repair dashboard

Goal: make it obvious how to start a repair and see active transactions.

Components:
- Heading: “Repairs” / “Your repair requests”.
- Primary button: “Start a repair”.
- Active repair card: device, current status, next required action, total if quoted.
- Recent completed repairs.
- Short transaction explainer: “Your payment is authorized first and captured only after you accept the submitted repair evidence.”
- Demo reset button accessible only to demo operator.

States: first-use empty, active requests, load error, session expired.

### Screen 2 — Repair intake

Goal: collect device and damage information with low cognitive load.

Fields:
- Brand and model selector (searchable controlled list).
- Symptoms text area.
- Upload up to four photos.
- Optional “What still works?” checklist (touch, display, charging, sound, camera) for screen-repair wedge.
- Submit for AI assessment.

Design:
- Device details above upload.
- Upload dropzone with previews, remove/replace controls and file constraints.
- Show upload progress, accepted type/size, validation errors.
- Do not require a photo to create a draft; AI diagnosis action can be disabled with a precise explanation.

### Screen 3 — AI diagnosis

Goal: show useful structured output without pretending certainty.

Layout:
- Device identity summary.
- `Visible observations` section (e.g. crack across front glass).
- `Likely repair` section with confidence band and plain-language caveat.
- `Unknown until inspection` section.
- `Suggested repair category` editable control.
- `AI-assisted assessment` label.
- Customer confirmation: “This describes what I can see / the symptoms I entered.”

Actions: Edit request, retry with another image, continue to find parts.

Never show pseudo-scientific 87% scores. Do not show AI model name to the customer.

### Screen 4 — Parts discovery

Goal: compare actual Channel3 catalog candidates, not fake compatibility.

Header: “Find replacement options”. Include device and repair category context.

Each product card:
- Product image (if available; neutral placeholder otherwise).
- Exact title.
- Merchant/domain and current offer price/currency.
- Availability and condition only when returned.
- Listing attributes/description relevant to model, if provided.
- `Candidate listing — compatibility not verified by Channel3` disclosure.
- Freshness timestamp from successful live detail refresh.
- External merchant link.
- Select button only when product ID and a current usable offer are present.

No usable offer: card can show “Price unavailable — cannot select for this contract”.

No results: explain no matching items were returned and offer refine/search another category. Do not show seeded cards.

API failure: show “Live product search is temporarily unavailable” with retry. Never show old cached prices as current.

A visible filter may allow New / Used / Refurbished only when the relevant values are actually available.

### Screen 5 — Quote comparison

Goal: compare total value, not cheapest-only ranking.

Each seeded repairer card must display `SIMULATED REPAIRER`.

Fields:
- Repairer display name (fictional).
- Component compatibility attestation (simulated).
- Part charge (repairer price, distinct from Channel3 retail reference price).
- Labour.
- Any disclosed fees/tax.
- Total.
- Warranty length / none.
- Estimated turnaround.
- Scope and exclusions.
- Selected Channel3 product reference.

No fake star rating, review count, credential or “verified” badge. Use structured differences and label one option “Lowest total” only if deterministic math supports it; do not label “Best” based on an undisclosed score.

### Screen 6 — Repair Contract review

Goal: ensure customer understands exactly what is being approved.

Show:
- Device and diagnosis caveat.
- Selected Channel3 product and merchant reference (fresh current offer before contract review).
- Simulated repairer attestation.
- Part charge, labour, fees/tax, total.
- Warranty, turnaround, scope, exclusions.
- Payment explanation: “PayPal will authorize this amount now. Capture is requested only after you accept the completed repair evidence. This is not escrow.”
- `SIMULATED REPAIRER` and `PAYPAL SANDBOX` badges.

Primary action: “Approve repair terms”. Then open PayPal approval.

### Screen 7 — PayPal approval and authorization

Use the official PayPal JS SDK Buttons. Do not recreate PayPal login or approval UI.

Display before button:
- Contract total and currency.
- Repairer name and simulated label.
- What authorization means (not captured yet).
- Cancel/return path.

On approved buyer flow, show a processing state until backend authorization returns. Do not set `AUTHORIZED` just because JS SDK `onApprove` fired; the backend must successfully authorize and persist provider response.

On cancellation, return to contract with `APPROVAL_CANCELLED`; no repair can start.

### Screen 8 — Simulated repairer workbench

Goal: make seeded repair work explicit and understandable.

Header includes `SIMULATED REPAIRER WORKBENCH`.

Show approved contract version and component details.

Actions:
- Start repair (only while payment authorized and contract current).
- Submit component declaration.
- Upload after photo(s).
- Complete functional checklist.
- Submit evidence.
- Request contract change (reason + proposed fields).

Prevent evidence submission before contract/authorization preconditions.

### Screen 9 — Change request

Display old vs new values side by side:
- Component listing reference (if changed).
- Part charge.
- Labour.
- Total.
- Warranty/scope/ETA.
- Reason.

Customer actions: Approve change / Reject change.

If payment amount changes: backend voids old authorization, confirms void, creates revised PayPal order; customer must approve and authorize again before work resumes. If void fails/unknown, block new authorization and show support/reconciliation state.

If non-financial field changes while amount unchanged, still require explicit contract approval; do not re-use the old auth until backend verifies amount/currency remains identical and the approved contract version is updated.

### Screen 10 — Completion review

Show:
- Approved contract snapshot.
- Before/after image gallery.
- Installed component declaration and any label photo.
- Functional checks and outcomes.
- AI evidence completeness checklist with missing/inconsistent items and explanations.
- Clear statement: AI checks evidence completeness; it does not certify repair quality or authenticity.

Customer actions:
- Accept repair and authorize capture.
- Request rework (comment required; no capture).
- Cancel repair and request authorization void.

No preselected/default acceptance. Require a confirmation dialog for Accept and Cancel.

### Screen 11 — Payment result and Repair Passport

Display only after confirmed provider state:
- Captured amount and currency.
- PayPal capture reference (not sensitive credentials).
- Contract version accepted.
- Selected product ID and merchant reference snapshot.
- Repairer declaration with simulated label.
- Before/after evidence.
- Functional checks.
- Warranty as stated in the contract.
- Timeline.

If capture is pending/unknown, show “We are confirming payment status” and a retry/reconcile action for operators, not “Paid”.

## 5. Component library

- `StatusBadge`: label + icon + status color.
- `EnvironmentBanner`: demo/sandbox label.
- `SimulatedActorBadge`.
- `EvidenceTypeBadge`: visual/component/functional.
- `ProductOfferCard`.
- `QuoteComparisonCard`.
- `ContractSummary`.
- `ContractDiff`.
- `PaymentTimeline`.
- `EvidenceGallery`.
- `FunctionalCheckList`.
- `AIObservationPanel`.
- `ErrorState`, `EmptyState`, `SkeletonState`.
- Confirm dialogs for Accept, Cancel, Void and Change approval.

## 6. Accessibility and interaction standards

- Semantic heading hierarchy and form labels.
- Visible keyboard focus ring and full keyboard operation.
- Dialog focus trap and focus restoration.
- `aria-live` for payment/evidence status transitions.
- Alt text for uploaded evidence; decorative product imagery may use empty alt when appropriate.
- Never encode error only with red.
- Minimum touch target 44×44 CSS px.
- Reduced motion mode.
- Responsive at 360 px, 768 px, 1024 px and 1440 px widths.

## 7. UI quality gates

- Every screen has loading, empty, validation, API-error and permission-denied states where relevant.
- Every amount shows currency and is formatted from integer minor units.
- The current contract total is visible before any PayPal action.
- Simulated repairer and sandbox labels are impossible to miss.
- No fake ratings, fake customer reviews, fake stock labels or fabricated Channel3 results.
- No automatic capture on evidence submission.
- User must understand “Authorize now; capture after acceptance” without reading README.
