# RepairRelay Documentation Index

Read in this order:

1. [Master product specification and build plan](REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md)
2. [Product specification](product/PRODUCT-SPEC.md)
3. [UX and design specification](product/UX-DESIGN.md)
4. [Competitive positioning](product/COMPETITIVE-POSITIONING.md)
5. [Scope ownership](product/SCOPE-OWNERSHIP.md)
6. [Scope prompts](product/PROMPTS.md)
7. [Architecture](architecture/ARCHITECTURE.md)
8. [Data model and state machines](architecture/DATA-MODEL-AND-STATE-MACHINES.md)
9. [Application API contracts](architecture/API-CONTRACTS.md)
10. [Channel3 integration](integrations/CHANNEL3.md)
11. [PayPal integration](integrations/PAYPAL.md)
12. [AI diagnosis and evidence](integrations/AI-AND-EVIDENCE.md)
13. [Implementation slices](plan/IMPLEMENTATION-SLICES.md)
14. [Test and edge-case catalogue](plan/TEST-EDGE-CASES.md)
15. [Execution checklist](plan/IMPLEMENTATION-CHECKLIST.md)
16. [Demo and submission](submission/DEMO-AND-SUBMISSION.md)
17. [Initial coding-agent prompt](plan/AGENT-START-PROMPT.md)
18. [Verification log](VERIFICATION-LOG.md)

## Authority order

`PRODUCT-SPEC.md` and the master build plan define product authority. UX defines interaction/visual behavior. Scope ownership controls who may edit which bounded context. Architecture and API contracts define technical boundaries. Integration docs define provider behavior. Implementation slices define execution order. No lower-level document may silently contradict a higher-level decision.

## First action

Run **S0 External Feasibility** in `plan/IMPLEMENTATION-SLICES.md` before coding the product UI. The Channel3 response schema and actual spare-part coverage, PayPal sandbox authorize/capture/void capability, and AI vision provider access are gates—not assumptions.
