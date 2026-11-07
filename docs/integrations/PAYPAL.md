# RepairRelay — PayPal Sandbox Integration Contract

**Payment model:** standard PayPal Orders authorization followed by Payments authorization capture or void. This is not escrow and does not disburse money to the simulated repairer.

## 1. Product and legal-language boundary

The buyer authorizes the platform's sandbox merchant before work. Following evidence submission, the customer makes an explicit accept/rework/cancel decision. Accept permits a backend capture call; cancel permits a backend void call. Rework does neither.

Do not say:
- escrow;
- funds are held in a marketplace escrow account;
- repairer is automatically paid;
- PayPal releases funds to the repairer;
- AI decides whether to charge.

The sandbox capture goes to the PayPal sandbox merchant account configured by the developer. Marketplace delayed disbursement requires a separate approved-partner capability and is out of scope.

## 2. Sandbox environment

Base URL:

`https://api-m.sandbox.paypal.com`

OAuth token:

`POST /v1/oauth2/token`

Use HTTP Basic with the sandbox Client ID and Secret and `grant_type=client_credentials`. Cache token securely until shortly before expiry. Never send the secret to the browser.

Before build, verify the selected sandbox business receiver supports Orders `AUTHORIZE`; PayPal may return `AUTH_CAPTURE_NOT_ENABLED` if merchant authorization/capture is not enabled. Confirm sandbox buyer/merchant test accounts and client ID are from the same environment.

## 3. Buyer approval UX

Use PayPal JavaScript SDK Buttons. Include public client ID, currency USD and `intent=authorize` in the SDK configuration. Use the actual PayPal sandbox approval UI; do not mock the login/approval page.

Frontend responsibilities:
- `createOrder` calls RepairRelay backend to create a server-side order.
- PayPal UI handles buyer approval.
- `onApprove` calls RepairRelay backend to authorize the approved order.
- `onCancel` returns the user to the contract with payment still not authorized.
- `onError` displays recoverable error and correlation ID.

Backend responsibilities:
- Verify order belongs to authenticated customer and exact approved contract version.
- Verify amount/currency matches immutable approved contract.
- Perform authorization server-to-server.
- Persist order/authorization IDs and provider status.
- Return business state to UI only after persisted provider result.

Do not treat JS SDK `onApprove` as `AUTHORIZED`. The backend authorization operation must succeed.

## 4. Order creation

`POST /v2/checkout/orders`

`intent: AUTHORIZE`

Use exactly one `purchase_unit` for the RepairRelay order. Multiple purchase units are not supported for the authorization flow being used here.

Amount is formatted as a decimal string from server-side integer minor units (e.g. 9500 → `95.00`). Include one purchase unit with the platform merchant/payee configured as permitted by the standard integration. Provide a neutral reference/invoice ID. Do not put private evidence or detailed device data into the PayPal description.

Persist a local PaymentAttempt and operation/idempotency key before the outbound order request. Order creation must not be triggered twice by duplicate clicks/retries.

## 5. Authorization

After buyer approval:

`POST /v2/checkout/orders/{order_id}/authorize`

Persist:
- PayPal order ID;
- authorization ID;
- exact authorized amount and currency;
- raw provider status;
- authorization time and expiry/honor information if returned;
- provider request/correlation ID;
- idempotency key.

Normalized `AUTHORIZED` is only set after confirmed successful provider response. Do not begin repair before this.

## 6. Capture

After explicit authenticated customer ACCEPT decision on the latest evidence and latest approved contract version:

`POST /v2/payments/authorizations/{authorization_id}/capture`

Requirements:
- contract total/currency equals authorization amount/currency;
- accepted decision references same contract version;
- no unresolved prior capture attempt;
- authorization is still capturable;
- no cancellation/rework decision has superseded acceptance;
- idempotency key is persisted/reused for retries.

Show `CAPTURED` only after PayPal confirms a completed capture. If the provider returns pending/unknown or network times out, show “Confirming payment status” and reconcile.

## 7. Void and cancellation

For an uncaptured authorization:

`POST /v2/payments/authorizations/{authorization_id}/void`

Use for:
- customer cancels the repair;
- customer approves a changed amount and the old authorization must be released before new authorization.

Do not label repair `CANCELLED` until void is confirmed, unless no authorization exists. If void is failed/unknown, keep `VOID_PENDING` or `VOID_UNKNOWN`, block new payment authorization and reconcile.

A captured payment cannot be voided. Refund after capture is separate and outside MVP.

## 8. Contract change and reauthorization

If amount changes:
1. create a pending contract change proposal;
2. customer approves new contract version;
3. void old uncaptured authorization;
4. confirm void;
5. create new PayPal order for new total;
6. buyer performs fresh approval;
7. backend authorizes new order;
8. resume repair only after current version is authorized.

If product/scope/warranty changes but amount remains same, still require explicit customer approval and new contract version. The orchestrator must verify the existing authorization matches amount/currency and that policy permits reuse for the new contract version. Safer MVP default: void and reauthorize after any material contract change. Do not silently rebind an old payment authorization.

If buyer rejects the change request, previous approved contract remains current. Repairer can continue original scope or ask customer to cancel.

## 9. Authorization timing

PayPal authorization is generally valid up to 29 days, but the 3-day honor period is the recommended period for the highest capture success. The MVP should complete the simulated repair and customer decision in one sitting/day. Record provider expiry/authorization state and never assume an old authorization remains capturable.

If authorization expires:
- block capture;
- require new buyer approval/order/authorization if the customer still wishes to proceed;
- preserve original contract/attempt history;
- do not silently create a new order.

## 10. Idempotency and uncertain outcomes

Use `PayPal-Request-Id` on supported POST operations. Each semantic mutation has a stable request ID persisted before the network call.

For timeout or lost response:
- mark operation `UNKNOWN`;
- retrieve order/authorization/capture details using provider query endpoints where available;
- reconcile before resubmitting;
- reuse the same idempotency key where PayPal's idempotency contract permits retry;
- never click again with a different key just because no UI response arrived.

For concurrent requests, database unique constraint on operation/idempotency key ensures only one operation is initiated. Return current status to duplicate callers.

## 11. Payment state mapping

| Internal state | Meaning |
|---|---|
| `NOT_CREATED` | No PayPal order created |
| `ORDER_CREATE_PENDING` | Local operation created, provider call in progress |
| `ORDER_CREATED` | Provider order ID confirmed |
| `BUYER_APPROVAL_PENDING` | PayPal buyer approval not yet completed |
| `BUYER_CANCELLED` | Buyer cancelled; no authorization |
| `AUTHORIZATION_PENDING` | Backend authorization call in progress |
| `AUTHORIZED` | Provider confirmed authorization |
| `AUTHORIZATION_DECLINED` | Provider denied authorization |
| `AUTHORIZATION_UNKNOWN` | Result uncertain; reconcile |
| `AUTHORIZATION_EXPIRED` | Provider indicates no longer capturable |
| `CAPTURE_PENDING` | Capture call in progress |
| `CAPTURED` | Provider confirmed completed capture |
| `CAPTURE_FAILED` | Provider definitively rejected capture |
| `CAPTURE_UNKNOWN` | Result uncertain; reconcile |
| `VOID_PENDING` | Void call in progress |
| `VOIDED` | Provider confirmed void |
| `VOID_FAILED` | Provider definitively rejected void |
| `VOID_UNKNOWN` | Result uncertain; reconcile |

Preserve raw provider status separately. Unknown future provider statuses must not be mapped to `CAPTURED` or `VOIDED`.

## 12. Error handling

- `AUTH_CAPTURE_NOT_ENABLED`: fail feasibility gate; configure/enable appropriate sandbox merchant capability or choose an eligible sandbox setup. Do not fake authorization.
- buyer cancels: no repair start.
- authorization declines: no repair start; allow explicit retry after user action.
- amount mismatch: block mutation; investigate contract version.
- expired authorization: fresh approval required.
- capture fails: show pending/failed status based on provider result; reconcile.
- void fails: do not start new authorization or claim cancellation complete.
- 5xx/timeout: mark unknown and reconcile.
- 4xx validation: surface safe message and log provider debug ID, not secrets.

## 13. Security and audit

- Client ID may be used by SDK; Client Secret is server-only.
- PayPal access token is server-only and memory-cached with expiry.
- Never log Authorization header, access token, secret, full buyer PII or card data.
- Do not store card details.
- Verify PayPal webhooks if implemented; unsigned browser redirect is not a webhook.
- Payment operations and customer decisions are immutable audit events.
- Separate `paymentStatus`, provider raw order status, raw authorization status and capture status.

## 14. Day 1 verification checklist

- [ ] Sandbox buyer and business accounts exist.
- [ ] Client ID/secret are valid and belong to sandbox.
- [ ] OAuth succeeds.
- [ ] Test merchant supports AUTHORIZE.
- [ ] PayPal JS SDK renders in local app/origin.
- [ ] Create order with one purchase unit succeeds.
- [ ] Sandbox buyer can approve.
- [ ] Orders authorize endpoint returns authorization ID.
- [ ] Capture authorization succeeds.
- [ ] Separate authorization test can be voided.
- [ ] `PayPal-Request-Id` behavior is understood and persisted.
- [ ] Timeout/reconcile logic is designed before production UI wiring.

Official reference: https://developer.paypal.com/docs/checkout/standard/customize/authorization/
