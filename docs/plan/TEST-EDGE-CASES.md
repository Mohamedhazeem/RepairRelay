# RepairRelay — Test Strategy and Edge-Case Catalogue

## 1. Test pyramid

- **Unit:** money arithmetic, schemas, normalizers, state transition rules, contract diff, evidence requirements.
- **Integration:** Prisma repositories/services with test Postgres; Channel3 adapter fixtures; PayPal adapter mocked at HTTP boundary for error cases.
- **Sandbox integration:** manual/automated smoke against real Channel3 key and PayPal sandbox accounts.
- **E2E:** Playwright across customer and simulated repairer roles.
- **Manual judge rehearsal:** full flow on a clean browser/profile and a clean database seed.

Mocks are suitable for deterministic tests; never silently use them as the judge-facing live integration.

## 2. Unit test matrix

### Money and quote arithmetic

- integer cents to decimal string formatting;
- decimal string to cents rejects excess precision;
- USD only in MVP;
- `0`, negative, NaN, Infinity and huge integer rejected;
- part + labour + fees + tax equals total;
- one-cent rounding boundary;
- no floating-point multiplication;
- amount/currency mismatch blocks contract/payment.

### Channel3 normalization

- products missing optional description/images/brands;
- product with no offers;
- multiple offers on one product;
- offer no price, missing currency, invalid currency;
- price nested as actual observed schema;
- unexpected price schema fails closed;
- price zero/negative/nonfinite rejected;
- non-HTTPS/malformed offer URL rejected;
- missing domain rejected for selectable offer;
- OutOfStock candidate cannot be selected if demo policy requires in-stock;
- `next_page_token` null/string/unexpected type;
- images prefer cleaned URL and handle null;
- invalid JSON and unexpected provider structure;
- product detail endpoint returns 404 or price changed;
- stale offer cannot be selected or displayed as current.

### AI schemas

- valid diagnosis;
- missing required keys;
- extra unexpected keys;
- arbitrary percentage not accepted;
- visible observation without evidence reference;
- contradictory device model;
- empty visible observations + inconclusive output;
- unrelated image;
- malformed output/timeout.

### Contract rules

- quote total deterministic;
- contract snapshot immutable;
- stale version rejected;
- amount change requires old authorization void/new auth;
- rejected change keeps old version active;
- same-total material change still requires explicit approval;
- quote expired before selection;
- product offer changed before contract approval.

### State machine

- illegal state transitions rejected;
- accept requires latest evidence and matching contract version;
- no capture on rework/cancel;
- no void after capture;
- no repair start before authorization;
- no passport before captured/accepted;
- unknown provider statuses preserved.

## 3. Integration test matrix

### Channel3

- valid key / successful search;
- 401 and 403;
- 429 with Retry-After;
- 5xx;
- timeout / connection reset;
- empty results;
- product has no offer;
- offer lacks URL or valid price;
- product detail refresh success / changed price / no longer found;
- ensure fixture-only data cannot leak to product UI.

### AI provider

- valid image request;
- timeout / quota limit / invalid credentials;
- structured output invalid;
- image upload rejected before AI call;
- AI unavailable does not destroy request or block manual path.

### PayPal

- OAuth success and failure;
- client credential mismatch;
- `AUTH_CAPTURE_NOT_ENABLED`;
- order create success and failure;
- buyer approve;
- buyer cancel;
- authorize success;
- authorize decline;
- order amount/currency mismatch;
- capture success;
- capture decline;
- capture 5xx/timeout with outcome unknown;
- void success;
- void failed/unknown;
- expired authorization;
- duplicate `PayPal-Request-Id`;
- duplicate customer click / concurrent server request;
- provider response after client disconnect;
- reconciliation shows completed / pending / not found;
- unknown future raw status.

## 4. E2E journeys

### E2E-01 Main happy path

Customer signs in → creates repair request → uploads image → receives AI diagnosis → runs live Channel3 search → selects current offer → sees three simulated quotes → selects quote → approves Repair Contract → PayPal buyer approval → backend authorization → repairer starts → submits after/component evidence and functional checks → customer accepts → backend capture → confirmed CAPTURED → Repair Passport visible.

### E2E-02 Contract change with amount increase

Customer approves $95 contract → PayPal authorizes $95 → repairer requests a different component and $105 total → customer approves change → server voids old $95 authorization → after confirmed void creates revised $105 order → buyer reapproves → server authorizes $105 → repair can resume. No work under new contract before new authorization.

### E2E-03 Change rejected

Repairer requests part change → customer rejects → original contract remains approved; old authorization remains associated only if still valid and amount unchanged; repairer can continue original contract or request cancellation. No unauthorized price/part substitution.

### E2E-04 Customer requests rework

Evidence submitted → customer requests rework with comment → no capture call → repairer performs one correction → new evidence submission → customer accepts → capture once.

### E2E-05 Customer cancels

Evidence submitted → customer cancels → void request → confirmed void → cancelled state. Assert no capture request occurred.

### E2E-06 PayPal unknown capture outcome

Customer accepts → capture network times out after provider may have processed → UI shows “Confirming payment” → reconciliation fetches provider state → only then shows CAPTURED or safe failure. Never create second capture.

### E2E-07 Channel3 failure

Search fails/empty → truthful error/empty state → retry; no fabricated/cached live results. Customer may adjust model/query or use approved fallback path.

## 5. Security tests

- customer cannot view other customer's repair/evidence/payment;
- repairer cannot view unassigned job;
- repairer cannot edit contract/price without change request;
- customer cannot impersonate repairer;
- demo admin reset inaccessible to ordinary users;
- asset ID guessing does not reveal private image;
- CSRF/session protections on mutations;
- rate limits on upload, AI, search and payment actions;
- no API key or PayPal secret in client bundle/network response;
- no sensitive token/secret in logs;
- uploaded SVG/HTML/polyglot/malformed file rejected;
- path traversal filename rejected;
- open redirect in PayPal return URL prevented.

## 6. UX and accessibility tests

- 360 px viewport; no horizontal overflow;
- 768/1024/1440 px layouts;
- keyboard-only flow through every primary action;
- focus restoration after dialogs;
- status changes announced to assistive technology;
- error text associated to form fields;
- color never sole status indicator;
- reduced motion works;
- minimum touch target size;
- PayPal button failure/cancel UI understandable.

## 7. Demo rehearsal checklist

- Clean DB seeded.
- Test buyer and merchant credentials available privately.
- Channel3 key works and current product offers refresh.
- AI provider responds within acceptable demo time; retry path prepared.
- PayPal order starts in clean state; no lingering uncaptured authorizations from previous rehearsal.
- Demo account roles are known.
- Browser zoom 100%, notifications and password manager prompts hidden.
- Network stable; no stale offer fixture used as live.
- Full main flow recorded once successfully before final day.
- A separate test proves cancel/void and rework without capture.
- Video stays under three minutes and shows working UI, not only slides.
