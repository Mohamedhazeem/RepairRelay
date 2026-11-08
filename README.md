# RepairRelay — Parts-Referenced Repair Transactions

**Tagline:** Know what is quoted. Approve every change. Pay after proof.

RepairRelay is an AI-assisted electronics repair decision and transaction experience. It links visual repair intake, live Channel3 product discovery, a customer-approved itemized Repair Contract, completion evidence and PayPal authorization/capture.

> **Project status: Conditional GO.** This repository pack is a specification and build plan, not a completed application. Live Channel3 spare-part coverage, PayPal sandbox authorization/capture/void, and the AI vision API must be verified using the developer's own credentials before feature implementation. See `docs/VERIFICATION-LOG.md`.

## Core demonstration

1. Customer uploads a damaged-device image and receives an AI visual assessment with explicit unknowns.
2. Channel3 returns actual candidate products and current merchant offers.
3. Three clearly labelled simulated repairers submit itemized quotes.
4. Customer approves a versioned Repair Contract.
5. PayPal sandbox buyer approval and authorization occur.
6. Simulated repairer submits component declaration, after photo and functional checks.
7. Customer accepts, requests rework or cancels.
8. Only customer acceptance triggers PayPal capture; cancellation triggers void.
9. A Repair Passport records the approved contract, evidence and confirmed payment.

AI is advisory. Channel3 does not certify compatibility. Repairer identities are simulated. PayPal authorization/capture is not escrow and does not pay a repairer. See the full specification before making product claims.

## Documentation

Start with [`docs/README.md`](docs/README.md), then read [`docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md`](docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md). The repository-level coding rules are in [`AGENTS.md`](AGENTS.md), and the initial coding-agent instruction is [`docs/plan/AGENT-START-PROMPT.md`](docs/plan/AGENT-START-PROMPT.md).

## Planned stack

Next.js App Router, TypeScript, PostgreSQL, Prisma, Auth.js, Tailwind CSS, shadcn/ui, Zod, a vision-capable AI provider, Channel3 Search API and PayPal Orders/Payments APIs.

## Setup status

**S0 feasibility passed and the S1 foundation slice is implemented** (Next.js 16 App Router, TypeScript, Tailwind 4, Prisma 6 + PostgreSQL, signed-cookie sessions with three demo roles, Vitest). Feature slices S2+ are in progress. Setup:

```bash
npm install
cp .env.example .env.local   # then fill in values (secrets stay local; .env.local is gitignored)
npx prisma migrate dev       # apply schema (PostgreSQL must be reachable)
npm run db:seed              # seed demo accounts (uses DEMO_SEED_PASSWORD)
npm run dev                  # http://localhost:3000
```

Quality gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. See `docs/VERIFICATION-LOG.md` for what has actually been verified.

## Important integration constraints

- Channel3 is product discovery, not fitment certification. Refresh offers before selection; do not show stale retail prices/availability/URLs as current.
- Use Channel3 `US/USD/en` locale for the demo; India/INR is not in the documented supported locale list reviewed for this project.
- PayPal standard authorization is not escrow. Capture reaches the configured platform sandbox merchant; repairer payout is out of scope.
- The user's production India PayPal account should not be described as supporting domestic Indian payments.
- All demo repairers and their compatibility statements are simulated.

## Hackathon submission

Deadline verified: **12 November 2026, 12:00 PM Pacific = 13 November 2026, 1:30 AM IST**. Public repository, open-source license, functional demo and public YouTube demo under three minutes are required. A hosted deployment is optional if judges can run the complete app from setup instructions.

See [`docs/submission/DEMO-AND-SUBMISSION.md`](docs/submission/DEMO-AND-SUBMISSION.md).

## License

MIT. See [`LICENSE`](LICENSE).
