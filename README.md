# RepairRelay — Parts-Referenced Repair Transactions

**Tagline:** Know what is quoted. Approve every change. Pay after proof.

RepairRelay is an AI-assisted electronics repair decision and transaction experience. It links visual repair intake with an honest AI assessment, live Channel3 replacement-device discovery (repair-vs-replace comparison), a customer-approved versioned Repair Contract, simulated repairer completion evidence, and a PayPal sandbox authorization that is **captured only after the customer explicitly accepts the submitted evidence**.

**Status: functional demo.** The full transaction has been executed live against real providers — Channel3 search, vision AI assessment, and PayPal sandbox authorize → capture (`CAPTURED/COMPLETED`), plus void and reconciliation paths. See `docs/VERIFICATION-LOG.md` for every recorded verification.

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

## Quick start

```bash
npm install
cp .env.example .env.local    # fill in values — secrets stay local; .env.local is gitignored
npx prisma migrate dev        # apply schema (PostgreSQL 14+ must be reachable)
npm run db:seed               # seed demo accounts (uses DEMO_SEED_PASSWORD)
npm run dev                   # http://localhost:3000
```

Environment variables (all documented in `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `DEMO_SEED_PASSWORD`, `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` (OpenAI-compatible vision endpoint), `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` (sandbox), `APP_URL`.

## Demo accounts

Seeded by `npm run db:seed` (password = your `DEMO_SEED_PASSWORD`):

| Role | Email |
|---|---|
| Customer | `customer@demo.repairrelay.test` |
| Simulated repairers | `repairer.ava@…`, `repairer.marcus@…`, `repairer.nadia@…` (`@demo.repairrelay.test`) |
| Demo operator | `admin@demo.repairrelay.test` |

Demo reset (wipes transactions, keeps accounts): `npm run db:demo-reset`.

## Judge walkthrough (~3 minutes)

1. Sign in as the **customer** → *Start a repair* → pick iPhone 13, describe symptoms, upload a damage photo.
2. *Run AI assessment* → honest structured triage with unknowns.
3. *replacement-device prices* → *Find replacement devices* (live Channel3) → pick one as the replace-price reference.
4. *compare repairer quotes* → *Request quotes* → compare itemized SIMULATED quotes → select one.
5. *review contract* → read the terms → *Approve repair terms*.
6. *Continue to PayPal authorization* → click the PayPal button → approve with a **sandbox buyer** account → the backend shows `AUTHORIZED` (a network blip shows `UNKNOWN` + reconciliation, never a fake success).
7. Sign in as **repairer.ava** → workbench → *Start repair* → upload an after photo, declare the component, complete the checks → *Submit evidence*.
8. Back as the **customer** → review evidence → *Accept repair* (confirm) → the backend captures the held funds (`CAPTURED`).
9. Open the **Repair Passport** — contract versions, evidence, checks, payment reference, full timeline.

## Quality gates

```bash
npm run lint        # ESLint, 0 problems
npm run typecheck   # TypeScript strict
npm test            # Vitest — 128 unit/integration tests
npm run e2e         # Playwright — customer journey + role guards (builds first run)
npm run build       # production build
```

## Stack

Next.js 16 App Router, TypeScript (strict), React 19, Tailwind CSS 4 (UX-spec design tokens), Prisma 6 + PostgreSQL, jose-signed HttpOnly cookie sessions with role middleware, sharp image pipeline, Vitest + Playwright, server-only adapters for Channel3 / OpenAI-compatible vision AI / PayPal Orders + Payments APIs.

## Important integration constraints

- Channel3 is product discovery, not fitment certification. Offer observations expire; nothing stale is shown as current.
- Channel3 `US/USD/en` locale only for this demo; India/INR is not in the documented supported locale list.
- PayPal standard authorization is not escrow. Sandbox capture reaches the configured platform merchant; repairer payout is out of scope.
- All demo repairers and their compatibility statements are simulated.

## Documentation

Start with [`docs/README.md`](docs/README.md), then [`docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md`](docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md). Every recorded verification with real commands and results: [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md). Coding rules: [`AGENTS.md`](AGENTS.md).

## Hackathon submission

Deadline verified: **12 November 2026, 12:00 PM Pacific = 13 November 2026, 1:30 AM IST**. See [`docs/submission/DEMO-AND-SUBMISSION.md`](docs/submission/DEMO-AND-SUBMISSION.md).

## License

MIT. See [`LICENSE`](LICENSE).
