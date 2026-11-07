# RepairRelay — Initial Coding-Agent Prompt

Paste this into the coding agent before starting implementation.

```text
You are implementing RepairRelay in this repository.

First read and obey:
- AGENTS.md
- README.md
- docs/README.md
- docs/REPAIRRELAY-2.0-SPEC-AND-BUILD-PLAN.md
- docs/product/PRODUCT-SPEC.md
- docs/product/UX-DESIGN.md
- docs/product/SCOPE-OWNERSHIP.md
- docs/architecture/ARCHITECTURE.md
- docs/architecture/DATA-MODEL-AND-STATE-MACHINES.md
- docs/architecture/API-CONTRACTS.md
- docs/integrations/CHANNEL3.md
- docs/integrations/PAYPAL.md
- docs/integrations/AI-AND-EVIDENCE.md
- docs/plan/IMPLEMENTATION-SLICES.md
- docs/plan/TEST-EDGE-CASES.md
- docs/submission/DEMO-AND-SUBMISSION.md

Do not start by generating the entire application or a large batch of code.

STEP 1 — REPOSITORY RECONNAISSANCE
Inspect the repository, current branch, files, package manager, framework, Node version, existing architecture, tests and instructions. Preserve sound existing code. Report current state and any conflicts with the project docs. Do not overwrite or reinitialize a working repository.

STEP 2 — EXECUTION PLAN
Create/update docs/implementation-checklist.md with every slice from docs/plan/IMPLEMENTATION-SLICES.md, owners, dependencies, acceptance criteria and status. Do not claim external verification unless it was actually run.

STEP 3 — S0 FEASIBILITY FIRST
Before implementing product screens, verify using local environment variables supplied by the user:
A. Channel3 authenticated POST /v1/search in US/USD/en default mode. Capture a sanitized raw response, inspect exact price/offer shape, then verify product detail refresh. Run the documented spare-part query matrix. Do not use fixtures as live UI data.
B. PayPal sandbox OAuth, one-purchase-unit Orders intent AUTHORIZE, buyer approval using official PayPal SDK/UI, authorization, capture and separate void. Confirm the merchant supports AUTH_CAPTURE. If unknown, reconcile; never fake a result.
C. One real vision API image request with schema-validated structured JSON.

Never ask the user to paste secrets in chat or commit them. Ask only for missing environment variable names and explain where they belong in .env.local. Never print secrets in logs.

STEP 4 — GATE DECISION
If Channel3 spare-part coverage passes, use Parts-Referenced Repair Contract. If not, test the documented alternate model/category. If no spare-part coverage works but replacement-device results work, switch to the explicitly documented Repair-versus-Replace mode and adjust product wording. If Channel3 itself is unavailable, stop and report the blocker. Do not fabricate listings.

STEP 5 — IMPLEMENTATION
Follow slices S1 through S11 strictly in docs/plan/IMPLEMENTATION-SLICES.md. Implement one complete vertical slice at a time, with tests and visible error/empty states. Do not build downstream screens against guessed upstream contracts. Use scope ownership in docs/product/SCOPE-OWNERSHIP.md. Use docs/product/PROMPTS.md if the work is delegated by bounded scope.

STEP 6 — QUALITY
At each slice boundary run the relevant lint, typecheck, tests and build. Cover all edge cases in docs/plan/TEST-EDGE-CASES.md. Payment capture must only occur after explicit customer acceptance of the latest evidence and contract version. Rework must not capture. Cancellation must void and confirm. Provider unknown outcomes must be reconciled.

STEP 7 — REPORT
Update docs/VERIFICATION-LOG.md with actual commands, timestamps, result, sanitized provider statuses and known limitations. Report what passed, failed, is blocked and what the next action is. Do not imply a feature is working if only mocked.

Do not add unrelated features. The goal is one convincing, safe, fully working transaction demonstration—not a broad marketplace.
```
