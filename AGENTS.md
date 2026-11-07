# AGENTS.md — RepairRelay Repository Instructions

## Authority

Before editing code, read:

1. `README.md`
2. `docs/README.md`
3. `docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md`
4. `docs/product/PRODUCT-SPEC.md`
5. `docs/product/UX-DESIGN.md`
6. `docs/product/SCOPE-OWNERSHIP.md`
7. Relevant `docs/architecture/*` and `docs/integrations/*`
8. `docs/plan/IMPLEMENTATION-SLICES.md` and `docs/plan/TEST-EDGE-CASES.md`

The product specification is authoritative. Lower-level implementation decisions must not silently change product behavior or payment safety rules.

## Non-negotiable engineering rules

- Inspect the existing repository before changing it. Preserve sound architecture and working code.
- Start with S0 feasibility. Do not assume credentials or provider capabilities.
- Never fabricate Channel3 results, repairer verification, AI diagnosis, PayPal authorization, capture or void.
- Channel3 product search does not certify compatibility or authenticity.
- Do not show cached Channel3 price, availability, image, description or offer URL as live/current. Test fixtures are not UI fallbacks.
- Mark every seeded repairer and compatibility attestation as simulated.
- AI is advisory. It cannot approve a contract, accept evidence or trigger PayPal.
- PayPal standard authorization is not escrow and does not pay the simulated repairer.
- Only explicit customer acceptance of the latest evidence and contract version may trigger capture.
- Rework never captures. Cancellation requires confirmed void if an uncaptured authorization exists.
- Treat provider timeouts as unknown outcomes; reconcile before retry.
- Use integer minor units for money and Zod for external input/output validation.
- Keep API secrets server-side and never commit `.env.local`.
- Do not log credentials, access tokens, payment card data, private images or full sensitive payloads.
- Keep external API adapters separate from business rules.
- Use one active owner per scope in `docs/product/SCOPE-OWNERSHIP.md`.
- Add tests with each implementation slice. Do not defer all tests.
- Keep `docs/VERIFICATION-LOG.md` truthful. Record only commands actually run and results actually observed.

## Implementation discipline

1. Execute `docs/plan/IMPLEMENTATION-SLICES.md` in order.
2. One vertical slice at a time; make each slice runnable before proceeding.
3. Run lint, typecheck, unit/integration tests and production build at slice boundaries.
4. Do not introduce Redis, BullMQ, microservices or unrelated sponsor SDKs unless the user explicitly changes scope and the integration has a clear win.
5. If a dependency is unavailable, stop at the documented gate and report the exact status; do not replace it silently with a fake implementation.
6. Keep the UI faithful to `docs/product/UX-DESIGN.md`; do not generate unrelated screens/features.
7. Update the README, environment template and verification log when commands or variables change.

## Completion language

Do not say “done”, “working”, “integrated”, “verified” or “tested” unless the exact acceptance criteria and relevant tests were run. Distinguish documentation review, local mock testing, real provider sandbox testing and live production behavior.
