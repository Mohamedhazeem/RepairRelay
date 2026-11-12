# RepairRelay — Parts-Referenced Repair Transactions

**Tagline:** Know what is quoted. Approve every change. Pay after proof.

RepairRelay is an AI-assisted electronics repair decision and transaction experience. It links visual repair intake with an honest AI assessment, live Channel3 replacement-device discovery (repair-vs-replace comparison), a customer-approved versioned Repair Contract, simulated repairer completion evidence, and a PayPal sandbox authorization that is **captured only after the customer explicitly accepts the submitted evidence**.

**Status: functional demo.** The full transaction has been executed live against real providers — Channel3 search, vision AI assessment, and PayPal sandbox authorize → capture (`CAPTURED/COMPLETED`), plus void and reconciliation paths. See `docs/VERIFICATION-LOG.md` for every recorded verification.

---

## What problem does RepairRelay solve?

When a consumer's phone breaks, several disconnected decisions follow — and each one is a trust gap:

- **What is actually damaged?** Online advice guesses; nothing separates what is *visible* in a photo from what needs physical inspection.
- **What will the repair actually cost?** Quotes are opaque one-liners — parts, labour, warranty and turnaround are never itemized against anything verifiable.
- **Will the repairer install the part they quoted?** Nothing ties a quote to a component declaration, and repairers can silently substitute cheaper parts or prices.
- **What if the plan changes mid-repair?** There is usually no formal customer approval — just a bigger bill at the end.
- **Why pay before seeing proof?** Customers are asked to pay upfront, or leave payment entirely to the repairer's honesty.

RepairRelay connects all of these into **one traceable transaction**: an honest AI assessment with explicit unknowns, itemized quotes from labelled actors, a versioned contract whose history cannot be rewritten, completion evidence with functional checks, and a payment that is **authorized up-front but captured only after the customer reviews the evidence and explicitly accepts**. Every state change is audited, and uncertain payment outcomes are shown as unknown until reconciled with the provider — never faked.

## What is different about this approach?

No single feature below is unique in isolation — the differentiated combination is:

- **Versioned, immutable Repair Contracts.** Every quote is frozen into an immutable contract version. A repairer *cannot* silently change the part, price, scope or warranty — any change is a formal change request with a server-computed before/after diff, and the customer's approval creates a *new* version while the old one stays readable forever.
- **Pay-after-proof, human-controlled.** PayPal authorization holds funds before work starts, but **only the customer's explicit acceptance of submitted evidence can trigger the capture**. Rejection or rework never moves money; cancellation voids the authorization (confirmed at the provider, never assumed). Unknown payment outcomes are an explicit state that must be reconciled — never shown as success.
- **Honest AI boundaries.** The AI separates visible observations from hypotheses and unknowns, uses confidence *bands* (never invented percentages), refuses to assess unrelated images, and can never decide compatibility, approve work, or touch payments. Its evidence-completeness flags are advisory only.
- **Real product data, clearly bounded.** Live retail offers from the Channel3 API ground the repair-vs-replace decision with current market prices — and the app never overstates what they mean: candidate listings, offers expire, nothing stale is shown as current, and compatibility is always attributed to the simulated repairer's declaration, never to the catalog.
- **Evidence-gated completion.** The repairer must submit after-repair photos, a component declaration (with identity basis — photo-verified or technician-declared, clearly distinguished), and mandatory functional checks. Deterministic product rules enforce completeness; the AI only adds advisory flags.
- **Auditable by construction.** Every meaningful state transition writes an append-only audit event, surfaced as the transaction timeline in the final Repair Passport.

---

## How PayPal powers this (the payment core)

PayPal is not a bolted-on checkout button — the Orders + Payments APIs are the trust backbone of the whole transaction:

- **Authorization-first lifecycle.** Orders v2 is called with `intent=AUTHORIZE` and exactly one purchase unit whose amount and currency are locked to the immutable approved contract version. Funds are held before work starts, so the repairer can commit — but nothing is earned yet.
- **The customer's acceptance is the capture trigger.** `POST /v2/payments/authorizations/{id}/capture` is reachable **only** from a recorded customer ACCEPT decision that references the current contract version. There is no code path where the AI, the repairer, or a browser click can capture. Rejection and rework never touch money.
- **Void as the safety exit.** Cancellation and approved amount-changes call the void endpoint — and void is never assumed: the final `CANCELLED` state appears only after the provider confirms it, and a captured payment can never be voided (provider-enforced and app-enforced).
- **Every mutation is idempotent and reversible-safe.** Each capture/void/order persists a `PayPal-Request-Id` and a local operation record **before** the outbound call. Duplicate clicks, double `onApprove` callbacks, and concurrent requests all resolve to the same single operation (DB-level compare-and-set on the attempt status).
- **Unknown outcomes are a first-class state.** If a response is lost (timeout, server restart, client disconnect), the payment lands in `CAPTURE_UNKNOWN` / `VOID_UNKNOWN` / `AUTHORIZATION_UNKNOWN` — the UI says "do not retry", and an operator reconciliation endpoint reads the provider's authoritative state to recover. This was demonstrated live: a buyer approval whose authorize call failed was reconciled and completed without any duplicate payment.
- **Sandbox honesty.** The buyer approval uses the official PayPal JS SDK + hosted sandbox UI; the capture goes to the configured platform merchant. The UI states plainly: this is not escrow and does not pay the repairer.

The full payment state machine (18 states including declines, expiry, pending, and unknowns) is implemented and unit-tested in `src/domains/payments/` — see `docs/VERIFICATION-LOG.md` for the live sandbox verifications of authorize → capture, void, expiry, and reconciliation.

## How AI powers this (the intelligence core)

AI is embedded at three points where it genuinely helps — and fenced off everywhere it could harm:

1. **Vision intake triage.** The customer's damage photo goes to a vision-capable model that returns schema-validated structured JSON: visible observations (with certainty levels), suspected causes, likely repair category, explicit **unknowns** (touch functionality, internal damage — things a photo cannot prove), and follow-up questions. It uses confidence *bands* (LOW/MEDIUM/HIGH/UNASSESSED), never fabricated percentages, and it **refuses to assess** blurry, unrelated, or abstract images — verified live: on an abstract test image it answered "no device visible, please upload a real photo" instead of inventing damage.
2. **Evidence completeness review.** When the repairer submits completion evidence, the model cross-checks the declaration against the approved contract and flags gaps and inconsistencies (e.g. "label photos missing — identity rests on technician declaration alone"). These flags are **advisory**: deterministic product rules enforce the hard requirements, and the customer decides with full knowledge even when the AI check is unavailable.
3. **Structured-output discipline.** Every AI response passes a strict Zod schema before it reaches the UI or the database; malformed or reasoning-split outputs are recovered by a robust extraction layer, and failures degrade to honest "AI assessment unavailable" states — the flow never fabricates a diagnosis or blocks the customer.

What AI is **fenced off from**: it cannot certify part compatibility or authenticity, approve the contract, accept evidence, compute payment amounts, or trigger any PayPal operation. Those boundaries are enforced in code, not just in prompts — `src/domains/payments/` is unreachable from AI/evidence code paths.

## The core flow (all verified live)

1. Customer creates a repair request and uploads a damage photo (privately stored, EXIF-stripped, access-controlled).
2. AI visual triage separates visible observations, hypotheses, and unknowns — confidence bands only, and it honestly reports `UNASSESSED` when an image shows no device.
3. Channel3 returns live replacement-device offers (the documented **Repair-versus-Replace mode** — spare-part coverage was insufficient at the S0 gate; see the decision in `docs/VERIFICATION-LOG.md` V-004).
4. Three clearly labelled **SIMULATED** repairers submit deterministic itemized quotes.
5. The customer approves a versioned Repair Contract; repairer changes require formal re-approval (history is immutable).
6. PayPal sandbox buyer approval and backend authorization hold the funds — never a silent SDK callback.
7. The simulated repairer submits after/component evidence and functional checks; AI completeness flags are advisory only.
8. **Only explicit customer acceptance triggers capture**; cancellation voids the authorization (confirmed void only); rework loops once without moving money.
9. The Repair Passport records the approved contract versions, evidence, checks, and the confirmed capture, with a chronological audit timeline.

AI is advisory. Channel3 does not certify anything. Repairer identities are simulated. PayPal authorization/capture is not escrow and does not pay a repairer.

---

## For judges and reviewers: setting up and testing

### Option A — run it yourself (recommended, ~10 minutes)

**Prerequisites:** Node.js 20+ (LTS), PostgreSQL 14+ running locally, and API credentials (below).

1. **Clone and install:**

   ```bash
   git clone https://github.com/Mohamedhazeem/RepairRelay.git
   cd RepairRelay
   npm install
   ```

2. **Create your environment file** (secrets stay local; `.env.local` is gitignored and must never be committed):

   ```bash
   cp .env.example .env.local
   ```

   Then set these values in `.env.local`:

   | Variable | Where to get it | Notes |
   |---|---|---|
   | `DATABASE_URL` | Your local PostgreSQL | e.g. `postgresql://postgres:postgres@localhost:5432/repairrelay` (database must exist) |
   | `AUTH_SECRET` | Generate: `openssl rand -hex 32` | Session signing key |
   | `DEMO_SEED_PASSWORD` | Choose any 12+ char password | Password for all seeded demo accounts |
   | `AI_BASE_URL` | Your vision-capable AI provider | OpenAI-compatible, e.g. `https://api.openai.com/v1` or `https://integrate.api.nvidia.com/v1` |
   | `AI_API_KEY` | Same provider | Server-side only |
   | `AI_MODEL` | Same provider | Must accept image input, e.g. a vision-capable model from the provider's catalog |
   | `CHANNEL3_API_KEY` | [Channel3 developer portal](https://trychannel3.com/developers) | Powers live product discovery (US/USD/en) |
   | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` | [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox) | **Sandbox** credentials; also create a **sandbox buyer** test account there (Testing Tools → Sandbox test accounts) |

   Optional for local judging: `APP_URL=http://localhost:3000` (used for PayPal return URLs).

3. **Migrate, seed, and run:**

   ```bash
   npx prisma migrate dev        # applies the schema
   npm run db:seed               # seeds the demo accounts (uses DEMO_SEED_PASSWORD)
   npm run dev                   # http://localhost:3000
   ```

4. **Sign in and take the walkthrough** (below) with the demo accounts:

   | Role | Email | Password |
   |---|---|---|
   | Customer | `customer@demo.repairrelay.test` | your `DEMO_SEED_PASSWORD` |
   | Simulated repairer | `repairer.ava@demo.repairrelay.test` | same |
   | Demo operator | `admin@demo.repairrelay.test` | same |

5. **PayPal buyer step:** when the PayPal button opens, log in with your **sandbox buyer** account (from the PayPal dashboard) — no real money moves.

**Reset between runs:** `npm run db:demo-reset` wipes all transactions and re-seeds accounts. A damaged-device test photo is provided at `tests/fixtures/ai/sample-device.png` for intake.

### Option B — code and test review without credentials

```bash
npm run lint          # ESLint — 0 problems
npm run typecheck     # TypeScript strict
npm test              # 128 unit/integration tests (needs only DATABASE_URL + AUTH_SECRET)
npm run e2e           # Playwright journey — needs the AI + Channel3 keys (real providers; the PayPal step stops before buyer approval)
npm run build         # production build
```

`npm test` covers money arithmetic, contract versioning/immutability, payment state machines (declines, timeouts, unknown outcomes, CAS concurrency), role guards, upload validation (MIME spoofing, EXIF stripping), and provider error mapping. Provider credentials are **not** required for the unit/integration suite.

### Suggested 3-minute judge walkthrough

1. Sign in as the **customer** → *Start a repair* → pick iPhone 13, describe symptoms, upload `tests/fixtures/ai/sample-device.png`.
2. *Run AI assessment* → honest structured triage with unknowns.
3. *replacement-device prices* → *Find replacement devices* (live Channel3) → pick one as the replace-price reference.
4. *compare repairer quotes* → *Request quotes* → compare itemized SIMULATED quotes → select one.
5. *review contract* → read the terms → *Approve repair terms*.
6. *Continue to PayPal authorization* → click the PayPal button → approve with your **sandbox buyer** → the backend shows `AUTHORIZED` (an interrupted network shows `UNKNOWN` + reconciliation — never a fake success).
7. Sign in as **repairer.ava** → workbench → *Start repair* → upload an after photo, declare the component, complete the checks → *Submit evidence*.
8. Back as the **customer** → review evidence → *Accept repair* (confirm) → the backend captures the held funds (`CAPTURED`).
9. Open the **Repair Passport** — contract versions, evidence, checks, payment reference, full timeline.

### For coding agents setting up this project

If you are an automated agent preparing this repository for review:

1. Run the Option A steps 1–3 exactly (all commands are non-interactive; `npx prisma migrate dev` applies committed migrations).
2. All required environment variables are declared in `.env.example`; every one must be present or the app fails fast at startup with a named-variable error (`src/lib/env.ts`). Do not invent defaults for `AI_*`, `CHANNEL3_API_KEY` or `PAYPAL_*` — the providers are gated, and the app degrades honestly (dependency-unavailable states) rather than faking results.
3. Tests: `npm test` runs without provider credentials; `npm run e2e` exercises real providers and the PayPal step intentionally stops before buyer approval (no test fakes provider results — see `AGENTS.md`).
4. Useful npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `e2e`, `db:migrate`, `db:seed`, `db:demo-reset`.
5. Server-only boundaries to preserve: `src/integrations/*` (Channel3/AI/PayPal adapters) must never be imported into client components; secrets live only in `.env.local`.

---

## Documentation

Start with [`docs/README.md`](docs/README.md), then [`docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md`](docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md). Every recorded verification with real commands and results: [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md). Coding rules: [`AGENTS.md`](AGENTS.md).

## Stack

Next.js 16 App Router, TypeScript (strict), React 19, Tailwind CSS 4 (UX-spec design tokens), Prisma 6 + PostgreSQL, jose-signed HttpOnly cookie sessions with a role-scoped request proxy (`src/proxy.ts`, the Next 16 replacement for the deprecated `middleware` convention), sharp image pipeline, Vitest + Playwright, server-only adapters for Channel3 / OpenAI-compatible vision AI / PayPal Orders + Payments APIs.

## Important integration constraints

- Channel3 is product discovery, not fitment certification. Offer observations expire; nothing stale is shown as current.
- Channel3 `US/USD/en` locale only for this demo; India/INR is not in the documented supported locale list.
- PayPal standard authorization is not escrow. Sandbox capture reaches the configured platform merchant; repairer payout is out of scope.
- All demo repairers and their compatibility statements are simulated.

## Hackathon submission

Deadline verified: **12 November 2026, 12:00 PM Pacific = 13 November 2026, 1:30 AM IST**. See [`docs/submission/DEMO-AND-SUBMISSION.md`](docs/submission/DEMO-AND-SUBMISSION.md).

## License

MIT. See [`LICENSE`](LICENSE).
