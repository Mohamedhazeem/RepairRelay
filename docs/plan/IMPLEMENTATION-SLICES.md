# RepairRelay — Ordered Implementation Slices

**Execution style:** sequential vertical slices, one owner per scope. Each slice ends with a runnable increment and tests. Do not start downstream work while an upstream exit criterion is failing.

## 0. Critical path overview

```text
S0 External feasibility (Channel3 + PayPal + AI)
  -> S1 Foundation / auth / DB / design system
  -> S2 Repair intake + private upload + AI diagnosis
  -> S3 Channel3 search + offer normalization
  -> S4 Simulated repairer quotes
  -> S5 Repair Contract + immutable version/change request
  -> S6 PayPal buyer approval + authorization
  -> S7 Repairer job + completion evidence
  -> S8 Customer accept / rework / cancel
  -> S9 PayPal capture / void / reconciliation
  -> S10 Repair Passport / timeline
  -> S11 E2E / polish / README / demo / submission
```

PayPal's raw sandbox authorize/capture/void feasibility test is performed during S0, even though app-level payment integration is wired after the contract exists. This reduces integration risk without forcing an incorrect dependency order.

## S0 — External feasibility spike (P0, before feature coding)

**Goal:** prove the three critical external dependencies and choose the parts-search path.

### Tasks
1. Create a secure local `.env.local`; never put secrets in Git or agent prompts.
2. Obtain Channel3 hackathon key using the sponsor instructions; verify server-side auth.
3. Run at least 5–6 default-mode product searches in US/USD/en.
4. Save sanitized raw responses in `tests/fixtures/channel3/` for tests only; strip API key and irrelevant user data. Never show fixture data in the app as current live listings.
5. Inspect real `products[]`, `offers[]`, images, price shape and pagination. Record actual response shape in verification log.
6. Verify product details refresh endpoint with a product ID; confirm current offer/price fields and auth header.
7. Check Channel3 usage/credits after calls.
8. Create PayPal sandbox buyer and business accounts. Confirm OAuth works.
9. Independently create an Orders v2 order with `intent=AUTHORIZE`, one purchase unit and USD.
10. Complete buyer approval using the official PayPal sandbox UI/JS SDK test page.
11. Authorize the order; record authorization ID and raw status.
12. On a separate authorized transaction, test void. On a successful authorization, test capture. Verify receiver sandbox account configuration supports AUTHORIZE.
13. Test same idempotency key behavior and inspect response after a simulated client timeout if possible.
14. Make one real vision API call with a sample test image; validate structured JSON and latency.
15. Confirm AI key is available separately from ChatGPT subscription.
16. Select primary repair model/category or explicitly approve the Repair-versus-Replace fallback.

### Channel3 query matrix

| Query | Why |
|---|---|
| `Apple iPhone 13 OLED screen replacement assembly` | Primary display part |
| `iPhone 13 OLED display digitizer replacement` | Query wording variation |
| `iPhone 13 replacement screen assembly refurbished` | Refurbished candidate |
| `Apple iPhone 13 replacement battery assembly` | Second component category |
| `Samsung Galaxy S23 OLED screen replacement assembly` | Alternate device/category |
| `Refurbished unlocked Apple iPhone 13` | Replacement-device alternative |

Optional negative control: `iPhone 13 LCD screen replacement`. Do not count it as a positive coverage result because iPhone 13 uses OLED, not LCD.

### Exit criteria
- [ ] Channel3 API key/auth works.
- [ ] At least two distinct relevant component products have usable current priced offers (or documented pivot selected).
- [ ] Product details refresh works.
- [ ] Exact price shape and response schema captured.
- [ ] PayPal OAuth works.
- [ ] Sandbox order approval, authorization, capture and void work.
- [ ] `AUTH_CAPTURE_NOT_ENABLED` is resolved, if encountered.
- [ ] AI image request returns schema-valid result.
- [ ] Build/no-build decision is written down.

**Do not proceed to S2/S3 on an assumption that these gates will work.**

## S1 — Foundation, auth, database and design system

**Goal:** establish a reliable application skeleton and role-aware shell.

### Tasks
- Inspect existing repository; preserve valid code and architecture.
- Confirm package manager, runtime and TypeScript strictness.
- Initialize Next.js App Router only if repository is not already a Next app; do not overwrite an existing project.
- Add Tailwind and shadcn/ui only as needed.
- Apply design tokens from UX spec.
- Set up PostgreSQL and Prisma migrations.
- Add `User` with `CUSTOMER`, `SIMULATED_REPAIRER`, `DEMO_ADMIN` roles.
- Implement Auth.js or equivalent server-side session and role guards.
- Seed customer, three simulated repairers and demo admin.
- Create global app shell, environment banner, simulated actor badge, status badge, error/empty/loading components.
- Add shared API error envelope, trace IDs, Zod conventions and money utilities.
- Add private storage adapter interface; local private storage implementation for local demo.
- Create `.env.example` and secret checks at startup.
- Add baseline scripts: `lint`, `typecheck`, `test`, `build`, `db:migrate`, `db:seed`.

### Tests
- role access, unauthenticated route, unauthorized record access;
- money conversion and currency formatting;
- API error envelope;
- upload config validation;
- seeded users/repairers and demo reset.

### Exit criteria
- Application boots; all three roles can sign in.
- Customer cannot access repairer/admin routes and vice versa.
- Database migrations and seed are reproducible.
- `.env.example` contains all variables actually used and no secret value.
- Lint/typecheck/unit test/production build pass.

## S2 — Repair intake, secure upload and AI diagnosis

**Goal:** a real customer can create a repair request and get an honest structured diagnosis.

### Tasks
- Implement request creation and model selector.
- Add symptoms and optional device functionality checklist.
- Add secure upload endpoint: 8 MB max/file, max 4 images; JPEG/PNG/WebP; actual decode; re-encode; strip EXIF.
- Implement private preview route with authorization.
- Implement AI provider interface and server-side vision adapter.
- Define and validate `DiagnosisReport` schema.
- Prompt model to separate visible observations / suspected causes / unknowns.
- Add confidence band categories, no percentage.
- Add edit/retry/manual continuation when AI fails or is inconclusive.
- Persist immutable diagnosis versions and audit events.

### Tests
- wrong file type, MIME spoof, corrupt image, oversized file, excess files;
- upload user not owner;
- image not accessible without authorization;
- AI invalid JSON, timeout, rate limit, unrelated image, blurry image;
- missing device model; user overrides AI guess;
- no diagnosis must not block draft retention.

### Exit criteria
- A real uploaded image produces valid structured output.
- AI uncertainty is visible.
- Inconclusive result allows customer to continue manually or retry.
- No arbitrary confidence percentage or fabricated fault.

## S3 — Channel3 product discovery and freshness

**Goal:** the app displays actual current Channel3 product candidates and merchant offers.

### Tasks
- Implement Channel3 client with server-side key, timeout and bounded retry policy.
- Use default mode and US/USD/en.
- Add raw response Zod validation based on S0 captured JSON; keep optional fields optional.
- Implement normalization adapter. Account for schema shape actually observed; if documentation shows price `price` or `amount` variants, accept only validated known variants.
- Parse `products[]`, `offers[]`, `next_page_token`.
- Use `images[].cleaned_url` then `images[].url`; image optional.
- Exclude selection when product lacks current priced offer, currency, merchant domain or valid HTTPS URL.
- Implement product detail refresh before selection and contract approval.
- Record `channel3ProductId` and search metadata; avoid caching stale offers/price/availability/images/offer URL.
- Add product cards with candidate disclosure and external merchant links.
- Add empty, timeout, 401/403, 429, 5xx, malformed JSON states.
- Implement the fallback mode only if S0 says spare part coverage is inadequate.

### Tests
- real response fixture parser;
- no products; no offers; two offers; no price; wrong currency; malformed URL; missing image; missing description;
- nested price variant; invalid amount; stale offer; product detail 404;
- 429 retry timing; timeout; 401/403;
- verify no stale fixture result is displayed as live.

### Exit criteria
- Live search shown in browser with current API data.
- User can select a product only after detail/offer refresh.
- Selection is disabled if no usable current offer.
- Channel3 compatibility disclaimer visible.

## S4 — Simulated repairer quotes

**Goal:** provide a transparent, itemized comparison grounded in the selected candidate.

### Tasks
- Seed three fictional repairer actors labelled `SIMULATED REPAIRER`.
- Generate stable demo quotes tied to the selected candidate; quote values are illustrative demo data, not live market quotes.
- Each quote includes part charge, labour, fees/tax if any, warranty, ETA, scope, exclusions and compatibility attestation.
- Separate Channel3 retail reference offer from repairer quote part charge.
- Deterministically calculate quote total in integer minor units.
- Add quote compare page; no fake ratings or reviews.
- Add quote validity/expiry and selection.

### Tests
- quote total arithmetic, zero labour, missing warranty, negative amount, invalid currency;
- quote expiry;
- quote cannot reference another user's product candidate;
- fake/nonexistent repairer actor rejected;
- part reference missing or offer not current blocks selection.

### Exit criteria
- Three simulated quotes compare transparently.
- Total math and labels are accurate.
- Customer can select one valid quote.

## S5 — Repair Contract, approval and change request

**Goal:** freeze exactly what customer approved and support changes without rewriting history.

### Tasks
- Create immutable contract version from selected quote/current product reference.
- Show full breakdown and disclaimers.
- Add explicit approval and optimistic version check.
- Start contract in `AWAITING_CUSTOMER_APPROVAL`; mark approved only after explicit customer action.
- Implement formal change request with reason and before/after diff.
- Compute delta server-side; optionally ask AI to explain the precomputed diff, never to calculate it.
- Customer approve/reject changes.
- Preserve prior version on rejection.
- If payment exists and material changes, call payment orchestration contract (S04) to void and later reauthorize; S03 never calls PayPal directly.

### Tests
- quote price changes between discovery and contract approval;
- concurrent approvals;
- duplicate approval click;
- stale version; attempted silent substitution;
- change request with no reason; invalid totals; wrong currency;
- rejected change preserves old contract;
- accepted amount change blocks repair until new authorization.

### Exit criteria
- Approved contract is immutable and versioned.
- Every term visible before payment.
- Change request can be demonstrated.

## S6 — PayPal buyer approval and authorization (application integration)

**Goal:** customer approves the exact current contract total and backend confirms authorization.

### Tasks
- Integrate PayPal JS SDK Buttons with `intent=authorize` and USD.
- Backend creates exactly one purchase unit for current approved contract.
- Persist PaymentAttempt and idempotency before outbound call.
- Handle JS SDK createOrder/onApprove/onCancel/onError.
- Backend authorizes the approved order and stores authorization ID/raw state.
- Compare returned amount/currency against approved contract.
- Block repair work until confirmed `AUTHORIZED`.
- Add payment panel with sandbox disclosure and clear non-escrow copy.

### Tests
- PayPal script fails to load;
- SDK create order error;
- buyer cancels;
- order approval callback arrives twice;
- authorize decline;
- amount mismatch;
- receiver merchant not enabled;
- network timeout/unknown;
- concurrent authorization requests;
- order belongs to different user/contract.

### Exit criteria
- Real sandbox buyer approval and authorization.
- No job starts without backend confirmed authorization.
- Duplicate clicks do not create duplicate operations.

## S7 — Simulated repairer job and evidence

**Goal:** submit sufficient repair completion evidence against the currently approved contract.

### Tasks
- Repairer workbench with `SIMULATED REPAIRER` banner.
- Start repair only after authorization and approved contract.
- Before photos link back to intake evidence; after and component evidence uploaded privately.
- Component declaration with identity basis.
- Functional checks for display/touch/brightness.
- Evidence submission bound to current contract version.
- Deterministic mandatory-field completeness rules.
- AI evidence completeness/consistency assistant with advisory flags.
- Handle AI unavailable state; evidence can still be judged by customer.

### Tests
- repairer not assigned; unauthenticated access;
- repair before authorization; stale contract evidence;
- missing after photo; component declaration blank;
- missing mandatory functional check;
- label photo absent but declaration provided;
- AI false positive/false negative; AI provider outage;
- upload malicious/corrupt file;
- duplicate evidence submit.

### Exit criteria
- Evidence categories visible and complete for demo.
- AI cannot change payment state.
- Customer sees the actual submitted evidence.

## S8 — Customer decision: accept, rework or cancel

**Goal:** explicit customer action drives the correct payment orchestration branch.

### Tasks
- Show contract version, evidence gallery, checklist and AI caveats.
- Require explicit confirm dialog for each decision.
- Accept command includes latest evidence submission and contract version.
- Rework requires comment and does not capture; allow one rework loop for demo.
- Cancel requests void; do not show final cancellation before confirmed void.
- Prevent decision on superseded evidence/version.
- Audit customer decision with timestamp and actor.

### Tests
- accept without evidence; accept wrong version;
- request rework no capture;
- cancel without authorization;
- cancel with auth void succeeds/unknown/fails;
- duplicate accept; accept and cancel race;
- rework after max count;
- customer not owner.

### Exit criteria
- Accept/rework/cancel branches are distinct and testable.
- No default acceptance.

## S9 — PayPal capture, void and reconciliation

**Goal:** make money state reflect actual provider results only.

### Tasks
- Capture only from accepted-decision orchestration.
- Void only from explicit cancellation or approved amount-change workflow.
- Use stable PayPal request ID.
- Persist operations before network calls.
- Add status GET/reconciliation for authorization/capture/void unknown outcomes.
- Preserve raw provider statuses and provider debug ID.
- Handle expiry, capture pending, decline and 5xx/timeout unknown.
- Use transaction locks/unique operation key to avoid duplicate mutation.
- Never mark captured on optimistic UI.

### Tests
- capture after accept;
- capture attempt before accept forbidden;
- capture twice; timeout after provider success;
- unknown capture then reconcile completed;
- unknown capture then provider shows not completed;
- void after capture forbidden;
- void unknown then reconcile;
- authorization expires before capture;
- amount mismatch; currency mismatch;
- new auth blocked until old void confirmed;
- payment API 4xx/5xx;
- webhook duplicate/out-of-order if webhooks exist.

### Exit criteria
- Actual capture after customer acceptance.
- Actual void after cancellation or changed amount.
- Unknown states remain unknown until reconciled.

## S10 — Repair Passport and timeline

**Goal:** provide a trustworthy receipt of agreed and performed work.

### Tasks
- Build passport only after accepted repair and confirmed capture.
- Show original diagnosis with caveat, exact contract version, product reference snapshot, simulated repairer declaration, component identity basis, evidence, functional checks, warranty and PayPal reference.
- Build chronological audit timeline.
- Do not display stale Channel3 offer as current; label contract record as historical price/offer at approval time.
- Export/share PDF only if time allows; web page is enough for MVP.

### Tests
- passport before capture unavailable;
- capture succeeded but repair status incomplete;
- wrong user access;
- historical offer label;
- deleted/unavailable image storage;
- unknown provider status doesn't create passport.

### Exit criteria
- Passport is accurate, read-only and tied to accepted contract/payment.

## S11 — Integration, hardening and submission

**Goal:** make the whole demo repeatable, safe and judge-ready.

### Tasks
- Full Playwright journey: create request → diagnosis → live Channel3 → quote → contract → PayPal approve/auth → evidence → accept → capture → passport.
- Secondary journey: change request amount → customer approval → old auth void → new auth → repair continues.
- Rework journey and cancellation/void journey.
- Add reset/demo seeds; reset must not falsify provider results.
- Verify demo labels, no stale cached price, no fake compatibility or ratings.
- Keyboard/accessibility and responsive pass.
- Run lint, typecheck, unit/integration/E2E, production build.
- Add README, `.env.example`, license, docs, test fixture provenance, verification log, demo script, public repo.
- Record public YouTube demo <3 minutes with real Channel3 request and PayPal sandbox transition.
- Submit early and verify Devpost receipt.

### Exit criteria
- Clean setup works from README.
- All mandatory flows pass.
- No unresolved payment unknown state in the recorded demo.
- Submission complete well before deadline.

## 2. Calendar plan (IST)

| Date | Primary focus | Non-negotiable result |
|---|---|---|
| Nov 8 | S0 gates + S1 skeleton | Channel3, PayPal and AI feasibility documented |
| Nov 9 | S1 + S2 | App/auth/database and one real diagnosis flow |
| Nov 10 | S3 + S4 | Live product results + quote comparison |
| Nov 11 | S5 + S6 + S7 core | Versioned contract + PayPal authorization + evidence |
| Nov 12 | S8–S11 | Decision/capture/void, E2E, recording, submission |

Do not use the calendar as a reason to skip exit criteria. If a gate fails, invoke the documented pivot immediately.

## 3. Cut order under deadline pressure

Cut first:
1. Animated transitions and decorative visuals.
2. Admin analytics and export features.
3. Multiple device categories beyond the proven primary category.
4. Multiple repair cycles beyond one rework loop.
5. Rich AI evidence image interpretation (keep deterministic checklist).
6. Deployment if local demo setup is complete and reliable.
7. PDF Repair Passport export (keep web passport).

Never cut:
- real Channel3 call and current offers;
- actual PayPal buyer approval + authorization + capture;
- customer decision gating capture;
- cancel/void handling;
- contract version/change request path;
- simulated repairer and sandbox labels;
- error handling for unknown provider outcomes;
- README + public licensed repo + YouTube demo.
