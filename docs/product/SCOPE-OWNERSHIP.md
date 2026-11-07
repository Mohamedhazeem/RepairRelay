# RepairRelay — Scope Ownership and Parallel Development Rules

**Authority:** `docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md` and `docs/product/PRODUCT-SPEC.md` are product authority. This file assigns development ownership; it does not redefine product decisions.

## 1. Global rules

- One active agent owns one scope at a time.
- Scopes are vertical product domains, not generic frontend/backend layers.
- The owning scope owns its domain rules, persistence, routes/components and tests.
- No scope edits another scope's migrations, schema ownership, route implementation or tests.
- Cross-scope communication uses exported types, service interfaces, API contracts or events.
- Shared package manifests, Prisma root schema, global styling, root routing and CI are shared hotspots and must have one named integrator owner.
- No agent invents an unavailable external API capability. Represent it through an adapter/port, a documented limitation and a test double that is visibly labelled in non-production test mode.
- Integration scope composes already working contracts; it is not a dumping ground for missing features.

## 2. Scope matrix

| ID | Scope | Owns | Depends on | Parallel safety |
|---|---|---|---|---|
| S00 | Foundation and design system | App shell, shared UI primitives, error conventions, auth/session baseline, shared validation/money helpers, database conventions | None | Must run first; shared hotspot |
| S01 | Repair intake and AI diagnosis | Repair request, private upload, diagnosis report, AI diagnosis adapter/schema and intake screens | S00 | Can run after S00 contracts freeze |
| S02 | Channel3 product discovery | Search adapter, raw response validation/normalization, product candidate lifecycle, freshness rules, parts UI | S00; S01 device/repair category contract | Can run in parallel with S01 only after shared contracts are stable; otherwise sequential |
| S03 | Quotes and Repair Contracts | Simulated repairers, quotes, line items, quote selection, contract versions, change requests | S00, S01, S02 | Depends on upstream data contracts; no PayPal implementation ownership |
| S04 | PayPal payment lifecycle | Orders create/approval callback handling, authorization/capture/void/reconcile, provider mapping, idempotency | S00, S03 contract interface | Provider prototype can be tested independently at Day 0; app wiring depends on S03 |
| S05 | Repair work and evidence | Simulated repairer workbench, evidence upload, functional checklist, AI evidence completeness | S00, S03, S04 authorization contract | Depends on S04 authorization state |
| S06 | Customer decisions and Repair Passport | Customer review, accept/rework/cancel commands, final timeline and passport view | S03, S04, S05 | Sequential after S05 core contract stable |
| S07 | Integration, QA and submission | Cross-scope wiring, E2E tests, demo reset, accessibility pass, README/deployment/demo assets | S00–S06 | Final integration owner only |

## 3. Domain ownership

### S00 — Foundation and design system

Owns:
- Root Next.js setup and global application shell.
- Auth/session configuration and role/ownership helpers.
- Shared API error envelope, request validation conventions and trace IDs.
- Money type/format/parse helpers.
- File storage abstraction interface and secure upload primitives.
- Shared design tokens, typography, breakpoints and primitive UI components.
- Prisma conventions and shared enums only where cross-domain.

Does not own repair workflow rules, Channel3 semantics or PayPal payment transitions.

### S01 — Repair intake and AI diagnosis

Owns:
- RepairRequest, UploadedAsset and DiagnosisReport domain persistence.
- Intake and diagnosis pages.
- Image validation/re-encoding, private storage and AI image request.
- Diagnosis schema, prompt, retries and human correction workflow.
- Diagnosis-specific tests.

Consumes user/session and shared upload contracts from S00.

### S02 — Channel3 product discovery

Owns:
- Channel3 REST/SDK client adapter and credentials boundary.
- Raw provider response fixtures for tests only.
- Normalized product/offer candidate contract.
- Freshness and price/offer refresh behavior.
- Product search run persistence and selected product reference.
- Product discovery UI and tests.

Does not own compatibility decisions, quote prices, merchant checkout, or PayPal.

### S03 — Quotes and Repair Contracts

Owns:
- SimulatedRepairer, RepairQuote, QuoteLineItem, RepairContract, ContractVersion, ContractChangeRequest.
- Quote calculation and validation.
- Contract creation, approval and change workflow.
- Quote comparison and contract pages.
- Contract state-transition tests.

Consumes product candidate ID/current offer reference from S02; never edits Channel3 adapter.

### S04 — PayPal payment lifecycle

Owns:
- PaymentAttempt, PaymentOperation, PayPal provider adapter and raw provider status storage.
- PayPal JS SDK configuration and server endpoints.
- Order creation, buyer approval handling, authorization, capture, void, idempotency and reconciliation.
- Payment status UI primitives and integration tests.

Consumes approved contract amount/currency/version from S03. It must never change contract amounts or trigger payment from AI/evidence service code.

### S05 — Repair work and evidence

Owns:
- RepairJob, EvidenceSubmission, EvidenceAsset, FunctionalCheck.
- Simulated repairer workbench.
- Evidence requirements by demo repair category.
- Evidence completeness AI adapter output and advisory flags.
- Evidence access control, file processing and tests.

Consumes approved contract and authorized payment state; cannot capture/void funds.

### S06 — Customer decisions and Repair Passport

Owns:
- Customer accept/rework/cancel decision UI and commands.
- Customer decision records and completion timeline projection.
- Passport read model and page.
- Cross-domain decision orchestration through S03/S04/S05 contracts.

Does not implement provider APIs or reinterpret AI evidence flags as approval.

### S07 — Integration, QA and submission

Owns:
- Cross-scope E2E and demo journey tests.
- Seed/reset script composition, environment checklist, build checks.
- Final navigation composition if unowned by S00.
- Submission README/demo/video assets and verification log.

Does not absorb incomplete domain logic or edit domain repositories directly.

## 4. Shared write hotspots

| Artifact | Exclusive owner | Other scopes |
|---|---|---|
| `package.json`, lockfile, TS config, Next config | Integrator/S00 | Request changes through owner; do not edit concurrently |
| `prisma/schema.prisma` and migration ordering | Integrator/S00 maintains file; domain scopes propose owned model changes via reviewed patches | No parallel edits to same schema file; merge one proposal at a time |
| Root app layout, navigation and global CSS | S00 | Feature scopes consume components |
| Shared API response/error types | S00 | Feature scopes extend only via request/review |
| `.env.example` | Integrator/S00 | Declare needed vars to owner |
| `README.md`, master spec, verification log | S07/integrator | Others provide notes; no overlapping edits |
| Payment provider files | S04 | Read-only to all other scopes |
| Channel3 adapter files | S02 | Read-only to all other scopes |

## 5. Dependency graph

```text
S00 Foundation
  ├── S01 Intake + AI ───────┐
  ├── S02 Channel3 ──────────┤
  │                          v
  └────────────────────────> S03 Quotes + Contract
                                  |
                                  v
                              S04 PayPal
                                  |
                                  v
                              S05 Work + Evidence
                                  |
                                  v
                              S06 Customer Decision + Passport
                                  |
                                  v
                              S07 E2E + Submission
```

S01 and S02 can be worked in parallel after S00 freezes the repair request and product candidate contracts. S04's raw PayPal feasibility prototype may be run independently before S03 exists, but the production application adapter is wired only against the approved contract interface.

## 6. Execution waves

- **Wave 0:** external feasibility spike (Channel3, PayPal, AI), plus S00 foundation decision.
- **Wave 1:** S00 complete; freeze shared contracts.
- **Wave 2:** S01 and S02 parallel if clean ownership is possible; otherwise execute sequentially.
- **Wave 3:** S03 quotes and contracts.
- **Wave 4:** S04 PayPal application integration.
- **Wave 5:** S05 repair work and evidence.
- **Wave 6:** S06 decisions and passport.
- **Wave 7:** S07 full integration, E2E, quality and submission.

With a single coding agent, execute sequentially in slice order. Do not parallelize one-agent work artificially.

## 7. Forbidden patterns

- A scope importing another scope's private repository/service internals.
- Multiple scopes editing the shared Prisma schema simultaneously.
- Duplicated payment or contract state machines.
- AI service calling PayPal capture or changing payment state.
- Channel3 adapter persisting stale offer prices/availability as current.
- Product search claiming compatibility.
- Repairer seed data labelled verified.
- UI state setting a payment to CAPTURED without provider confirmation.
- A mock implementation silently replacing a live integration.

## 8. Integration responsibility

S07 verifies the composition of domain-owned services. Cross-scope changes must be requested through exported contracts, not by patching another scope's code. Any unresolved ownership overlap blocks parallel work until resolved.
