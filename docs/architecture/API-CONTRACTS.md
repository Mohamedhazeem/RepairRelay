# RepairRelay — Application API Contracts

These are application-level contracts, not copies of provider APIs. Exact paths can be adjusted to repository conventions, but semantics, preconditions and status meanings must remain. Validate all request/response bodies with Zod.

## 1. API conventions

- JSON unless an endpoint explicitly accepts multipart upload.
- All mutation endpoints require authenticated session + server-side role and ownership check, except PayPal return callback handlers and explicitly scoped public invitation routes (not required in the RepairRelay MVP).
- All responses include `traceId`.
- Error envelope:

```json
{
  "code": "CONFLICT",
  "message": "The repair contract has changed. Refresh and review the latest version.",
  "traceId": "uuid"
}
```

- Stable codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `PROVIDER_REJECTED`, `PROVIDER_OUTCOME_UNKNOWN`, `PAYMENT_REQUIRES_RECONCILIATION`, `ASSET_INVALID`, `INTERNAL_ERROR`.
- Do not expose provider secrets, raw provider error payloads, stack traces or internal file paths.
- Mutations accept `Idempotency-Key` or a provider-specific idempotency key where appropriate. Repeating the same semantic command returns the existing operation/result.
- Use optimistic concurrency (`expectedVersion`) on contract-sensitive commands.

## 2. Repair intake

### `POST /api/repairs`

Creates a draft repair request.

Request:

```json
{
  "device": {"brand":"Apple","model":"iPhone 13"},
  "symptoms":"The front glass is cracked. Touch currently responds.",
  "repairCategory":"DISPLAY_REPLACEMENT"
}
```

Response: `{ "repairId", "publicReference", "status", "version" }`.

Rules: authenticated customer only; validate device and text lengths; model may be `UNKNOWN` but then exact part search requires user confirmation/selection; create audit event.

### `POST /api/repairs/:repairId/assets`

Multipart upload with `file`, `assetKind=INTAKE`.

Rules: max 8 MB/file, max 4 intake images; JPEG/PNG/WebP only, actual decode validation; reject SVG and animated content; re-encode/strip EXIF; private storage; ownership check; return opaque asset ID and preview route, never raw storage path.

### `POST /api/repairs/:repairId/diagnosis`

Starts or executes multimodal diagnosis. Request `{ "assetIds": ["..."], "symptoms": "...", "deviceModel": "..." }`.

Response includes structured diagnosis ID, visible observations, suspected causes, likely repair category, confidence band, unknowns and next questions.

Rules: rate limit; schema validate model output; persist immutable report; AI failure returns recoverable `DEPENDENCY_UNAVAILABLE` and leaves draft intact; never run PayPal or choose product as a side effect.

## 3. Channel3 product discovery

### `POST /api/repairs/:repairId/product-search`

Request:

```json
{
  "query":"Apple iPhone 13 OLED screen replacement assembly",
  "mode":"default",
  "limit":10,
  "locale":{"country":"US","currency":"USD","language":"en"}
}
```

Response:

```json
{
  "searchRunId":"uuid",
  "status":"SUCCEEDED",
  "results":[
    {
      "candidateId":"uuid",
      "channel3ProductId":"provider-id",
      "title":"...",
      "imageUrl":null,
      "offer":{
        "domain":"merchant.example",
        "url":"https://merchant.example/item",
        "priceMinor":6500,
        "currency":"USD",
        "availability":"InStock",
        "condition":"new",
        "observedAt":"2026-11-08T00:00:00Z"
      },
      "selectionEligible":true,
      "compatibility":"NOT_VERIFIED_BY_CHANNEL3"
    }
  ],
  "nextPageAvailable":false
}
```

Rules:
- The adapter may return candidate results without offers for information, but `selectionEligible` must be false.
- `priceMinor` is only populated from validated positive numeric price and currency.
- A product may return multiple offers. MVP chooses one explicit offer for quote reference, not an implicit lowest-price winner.
- Search failure returns status and safe error code, never fabricated data.
- `page_token` pagination may be added only if it is needed; do not auto-fetch many pages during demo.

### `GET /api/repairs/:repairId/products/:candidateId/refresh`

Calls Channel3 product details/offer refresh server-side (documented current product-detail endpoint `GET /v1/products/{product_id}`; confirm exact request/response against current API reference during implementation).

Response is a normalized fresh candidate/offer with `observedAt` and `selectionEligible`.

Rules: if no current priced offer or product no longer exists, return `selectionEligible:false`; never fall back to stale stored offer URL/price.

### `POST /api/repairs/:repairId/product-selection`

Request `{ "candidateId":"uuid", "channel3ProductId":"...", "offerDomain":"...", "expectedPriceMinor":6500, "currency":"USD" }`.

Rules: server re-fetches offer and compares chosen offer identity/price/currency. If price changes, return `409 OFFER_CHANGED` with fresh values; customer must choose again. Persist product ID and contract audit snapshot only after current offer validation.

## 4. Quotes and contract

### `GET /api/repairs/:repairId/quotes`

Returns seeded simulated repairer quotes only if repairer selection prerequisites exist. Every repairer object includes `demoActor:true` and UI must label it.

### `POST /api/repairs/:repairId/quotes/:quoteId/select`

Request `{ "expectedRepairVersion":3 }`.

Rules: customer owns repair; quote is valid and not expired; quote references selected product candidate; product offer is refreshed; server calculates total using integer minor units; create contract draft/version.

### `POST /api/contracts/:contractId/approve`

Request `{ "expectedContractVersion":1, "confirmed":true }`.

Rules: all contract terms visible; required part/offer, repairer attestation, currency, amount, scope, warranty and estimated duration present; quote not expired; current offer refreshed; create immutable approved version and audit event. Do not call PayPal until the next explicit payment action.

### `POST /api/contracts/:contractId/change-requests`

Request includes `expectedContractVersion`, `reason`, and `proposedChanges` (component reference, part charge, labour, fees, warranty, scope, ETA). The server produces deterministic `before` and `after` contract values and calculates new total.

Rules: no direct contract overwrite. `PENDING` change request created; customer decides.

### `POST /api/change-requests/:changeRequestId/decision`

Request `{ "decision":"APPROVE"|"REJECT", "expectedContractVersion":1 }`.

Rules: approval creates a new immutable contract version. If payment amount changes, the payment orchestrator voids old authorization and requires a new PayPal buyer approval/authorization before work resumes. Reject leaves prior approved contract in force. If void is unknown or failed, block new authorization and require reconciliation.

## 5. PayPal order and authorization

### `POST /api/contracts/:contractId/paypal-order`

Request `{ "contractVersionId":"uuid" }`.

Rules: create exactly one PayPal purchase unit; amount/currency must equal current approved contract; server generates and persists `PayPal-Request-Id`; no order if payment already authorized/captured or prior operation unresolved. Return PayPal order ID and approval integration data (not client secret).

### PayPal JS SDK integration

The browser renders Buttons with `intent=authorize` and the public client ID. `createOrder` calls the endpoint above; PayPal owns buyer approval UI. `onApprove` calls the server authorization endpoint. `onCancel` marks the approval flow cancelled (not a paid state). `onError` displays retry guidance. Browser never sends `authorization_id` as trusted state without server association and never calls capture directly.

### `POST /api/paypal/orders/:orderId/authorize`

Request `{ "contractVersionId":"uuid" }`.

Rules: server confirms order belongs to this contract/customer and exact amount/currency; calls `POST /v2/checkout/orders/{order_id}/authorize`; persists authorization ID and raw status; `AUTHORIZED` only after confirmed provider result. If timeout, store `AUTHORIZATION_UNKNOWN` and reconcile; do not create new order blindly.

## 6. Simulated repair work and evidence

### `POST /api/repairs/:repairId/job/start`

Rules: current contract approved; current payment authorization confirmed and matches contract amount/currency/version; repairer actor assigned; job not already started.

### `POST /api/repairs/:repairId/evidence/assets`

Upload private after/component evidence using the same strict file rules. Customer before-image remains immutable.

### `POST /api/repairs/:repairId/evidence`

Request:

```json
{
  "contractVersionId":"uuid",
  "componentDeclaration":"OLED replacement assembly, technician-declared",
  "componentIdentityBasis":"TECHNICIAN_DECLARATION",
  "functionalChecks":[
    {"check":"display_image","result":"PASS"},
    {"check":"touch_response","result":"PASS"},
    {"check":"brightness_control","result":"PASS"}
  ],
  "afterAssetIds":["uuid"],
  "componentAssetIds":[],
  "notes":"..."
}
```

Rules: only assigned simulated repairer; evidence tied to current approved contract version; complete mandatory checks; submit immutable evidence submission; run AI assessment async/in-request depending latency but ensure error state is non-blocking; no payment side effect.

## 7. Customer decisions and payment operations

### `POST /api/repairs/:repairId/customer-decision`

Request `{ "evidenceSubmissionId":"uuid", "contractVersionId":"uuid", "decision":"ACCEPT"|"REQUEST_REWORK"|"CANCEL", "comment":"..." }`.

Rules:
- Customer only; authenticated and owner of repair.
- Decision references latest evidence submission and current approved contract version.
- Accept requires evidence submission and explicit confirm checkbox/dialog; creates immutable decision then calls payment orchestrator capture command.
- Rework requires comment and does not call capture.
- Cancel creates cancel request and calls payment orchestrator void command; UI shows cancelled only when void confirmed. If no authorization exists, cancel without provider call.

### `POST /api/payments/:paymentAttemptId/capture`

Prefer internal server-to-server use by customer decision service; never expose to browser as a general-purpose unguarded action. If route is exposed, require the immutable accepted decision ID and verify all preconditions.

Rules: same auth and contract version; amount/currency exact; no prior capture; current auth state confirmed; idempotency key persisted; reconcile unknown outcomes. `CAPTURED` only when provider says capture completed.

### `POST /api/payments/:paymentAttemptId/void`

Prefer internal service. Require explicit cancel or approved amount-change workflow. Cannot void a captured payment. Reconcile unknown void before retry.

### `POST /api/payments/:paymentAttemptId/reconcile`

Operator/demo admin or controlled internal call. Retrieve current authorization/capture details and update local raw/normalized status. Does not create a new provider mutation.

## 8. Repair Passport

### `GET /api/repairs/:repairId/passport`

Returns a passport only once the repair has customer acceptance and PayPal capture is confirmed. Otherwise return status summary with passport not yet finalized. Includes contract version, product reference, simulated repairer declaration, evidence, functional checks, warranty terms and payment reference; never includes secret/provider credentials.

## 9. Provider webhook note

Webhooks are optional for the MVP if the app reliably reconciles before displaying final state. If a PayPal webhook is added, verify its signature against official PayPal verification process, make handling idempotent and treat webhook as a signal to reconcile, not permission to skip state checks. Do not accept an unsigned browser callback as a provider webhook.
