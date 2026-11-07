# RepairRelay — Technical Architecture

**Decision:** modular monolith, one TypeScript application, one relational database, server-side provider adapters. Build for correctness and demo reliability; do not introduce distributed infrastructure without demonstrated need.

## 1. Technology decisions

| Concern | Decision | Reason / boundary |
|---|---|---|
| Web application | Next.js App Router + TypeScript | One deployable app and typed server/client boundary |
| UI | Tailwind CSS + shadcn/ui + Lucide | Fast accessible component system |
| Design | Tokens and screen rules in `UX-DESIGN.md` | Prevent inconsistent generated UI |
| Database | PostgreSQL | Transactions, unique constraints and relational integrity |
| ORM | Prisma | Schema and migration ownership |
| Validation | Zod | Validate HTTP, environment, AI and external data |
| Authentication | Auth.js Credentials or equivalent | Seeded demo roles; no public signup required |
| AI | Vision-capable model behind provider adapter | Swap model without changing business logic |
| Channel3 | Server-only REST first; SDK 4.x optional after schema verification | Inspect raw response before mapping |
| PayPal | JS SDK Buttons + Orders v2 + Payments authorization endpoints | Real buyer approval and backend-controlled capture |
| Image processing | Sharp (or equivalent) | Decode/re-encode raster images and strip metadata |
| Upload storage | Local private storage for local demo; adapter for private object storage if deployed | Avoid public uploads and unnecessary infra |
| Tests | Vitest + Playwright | Unit/integration and browser E2E |
| Hosting | Optional Render or equivalent | Local complete setup is acceptable; do not risk deadline on hosting |

## 2. Architecture principles

- Business logic is independent of Next.js Route Handler and provider SDK objects.
- External integrations are adapters behind application ports.
- Every external response is runtime-validated before entering domain logic.
- The database is the source of truth for contracts and payment state, not browser state.
- Money is integer minor units inside the application.
- External payment mutation must be idempotent and recoverable after timeout.
- AI outputs are untrusted proposals; Zod validation and deterministic business rules follow them.
- Images and evidence are private assets with authorization checks on reads.
- Audit events are append-only at the application level.
- No stale Channel3 offer values are rendered as current.
- Simulated demo actors and sandbox operations are visibly disclosed.

## 3. High-level components

```text
Browser (Next.js client)
  ├── Customer experience
  ├── Simulated repairer workbench
  └── PayPal JS SDK Buttons
          |
          v
Next.js Server / Application Services
  ├── Identity & Authorization
  ├── Repair Intake Service
  ├── AI Diagnosis Port -------- AI Provider
  ├── Product Discovery Port --- Channel3 API
  ├── Quote & Contract Service
  ├── Payment Orchestrator ------ PayPal OAuth + Orders/Payments APIs
  ├── Repair Work & Evidence Service
  ├── Customer Decision Service
  ├── Repair Passport Query
  └── Audit/Event Service
          |
          v
PostgreSQL + Private Asset Storage
```

No client browser request may contain Channel3 secret, PayPal client secret or AI key. Browser receives only the PayPal public client ID needed by the SDK.

## 4. Suggested repository structure

```text
.
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (customer)/repairs/page.tsx
│   │   ├── (customer)/repairs/new/page.tsx
│   │   ├── (customer)/repairs/[repairId]/page.tsx
│   │   ├── (repairer)/repairer/jobs/[repairId]/page.tsx
│   │   ├── (admin)/demo/page.tsx
│   │   └── api/...
│   ├── components/
│   │   ├── shell/
│   │   ├── intake/
│   │   ├── diagnosis/
│   │   ├── products/
│   │   ├── quotes/
│   │   ├── contracts/
│   │   ├── payments/
│   │   ├── evidence/
│   │   └── ui/
│   ├── domains/
│   │   ├── identity/
│   │   ├── repairs/
│   │   ├── diagnosis/
│   │   ├── products/
│   │   ├── quotes/
│   │   ├── contracts/
│   │   ├── payments/
│   │   ├── repair-work/
│   │   ├── evidence/
│   │   └── passport/
│   ├── integrations/
│   │   ├── channel3/
│   │   ├── paypal/
│   │   └── ai/
│   ├── lib/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── env/
│   │   ├── money/
│   │   ├── http/
│   │   ├── storage/
│   │   ├── security/
│   │   └── audit/
│   └── styles/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── public/
└── .env.example
```

Keep Route Handlers thin: parse input, authenticate/authorize, call application service, return typed response. Do not put provider logic or monetary calculations inside page components.

## 5. Application layering

### Presentation

Pages, components, client forms, PayPal Buttons. May call same-origin application endpoints. It must not read server secrets or directly call Channel3/PayPal payment mutations.

### Application services

Orchestrate use cases: `createRepairRequest`, `runDiagnosis`, `searchProducts`, `selectQuote`, `approveContract`, `createPayPalOrder`, `authorizePayment`, `submitEvidence`, `acceptRepair`, `requestRework`, `cancelRepair`, `capturePayment`, `voidPayment`, `reconcilePayment`.

### Domain

Pure rules and state transitions: amounts, contract versioning, quote totals, eligibility, payment preconditions, evidence requirements and allowed transitions.

### Infrastructure

Prisma repositories, file storage adapter, Channel3 adapter, AI adapter, PayPal adapter, audit writer.

## 6. Transaction and concurrency rules

- A contract approval command must use compare-and-swap / optimistic concurrency with current `version` and status.
- A repairer must not submit evidence against a stale contract version.
- A payment capture command must verify: current approved contract version, authorized amount/currency match, authorization still valid according to latest known PayPal state, customer acceptance exists and no prior capture operation is unresolved/completed.
- Create the local payment operation row and idempotency key before the outbound PayPal mutation.
- Do not hold a database transaction open during a network call. Use short transactions to create operation state, call provider outside transaction, then persist result.
- Concurrent clicks must return the existing operation result or `409 OPERATION_IN_PROGRESS`, not create a second payment mutation.
- If provider result is uncertain, mark `UNKNOWN` and reconcile before repeating mutation.
- Product offer may change between discovery and contract selection; refresh immediately before selection and again before final contract approval if enough time has passed.
- A quote accepted against an offer whose current product identity changed must require manual reconfirmation.

## 7. Security architecture

- Authenticated customer owns their repair, contract and payment view.
- Simulated repairer can access only assigned demo jobs and permitted evidence/contract details.
- Admin/demo operator can reset seed state and inspect redacted provider statuses, not secrets.
- Server validates all roles and record ownership; hidden buttons are not authorization.
- CSRF protection for session-authenticated mutations as appropriate to the chosen auth setup.
- SameSite, Secure and HttpOnly session cookies in production.
- Rate-limit AI diagnosis, product search, uploads and payment mutations.
- Use request IDs/trace IDs in logs; never log access tokens, client secrets, image contents, full buyer email or raw unredacted provider payloads.
- Sanitize filenames; store generated object keys, not user-supplied paths.
- Restrict asset access through authenticated route or signed private URL with short expiry.
- Limit uploaded content type by actual decoder, not browser MIME only.
- Re-encode image to strip EXIF/geolocation; do not retain original unless a separate need is justified.
- Keep PayPal buyer approval on PayPal-hosted/SDK UI. RepairRelay does not receive card credentials.

## 8. Observability

Every API request gets `traceId`. Structured logs include domain identifier, event/action, actor role, latency, provider name and redacted provider request ID. Never log secrets or private evidence.

Metrics for local/demo diagnostics:
- Channel3 request success/latency/empty results/normalization failures.
- AI request success/latency/parse failures.
- PayPal order/authorization/capture/void/reconcile operations and unresolved states.
- Upload validation failure and storage failure.

Append audit events for: request created, diagnosis requested/result accepted, product search performed, product selected, quote created/selected, contract approved/version changed, PayPal operation, evidence submitted, customer decision and passport generated.

## 9. Deployment and local operation

A local complete demo with documented setup is acceptable. Recommended baseline:

1. Node LTS version supported by selected Next.js release.
2. PostgreSQL local or hosted.
3. `.env.local` built from `.env.example`.
4. `npm ci`, Prisma migrate, seed, `npm run dev`.
5. HTTPS/tunnel only if PayPal SDK or webhook testing requires a public callback; buyer approval can use local return URLs if supported by sandbox config.
6. Do not make hosting a prerequisite for core integration tests.

If deployed, use a managed Postgres database, private storage, TLS, separate sandbox secrets and explicit demo environment banner. No production payment mode toggle should be exposed to users.

## 10. Architecture decisions to avoid

- No microservices or event broker.
- No Redis/BullMQ for this short-running demo.
- No direct browser-to-Channel3 API calls.
- No direct browser-to-PayPal capture/void.
- No AI-controlled payment action.
- No stale Channel3 offer response cache surfaced in UI.
- No separate repairer payout implementation.
- No hidden demo mode that silently returns fake provider success.
