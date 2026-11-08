/**
 * PayPal Orders/Payments adapter (S04 scope) — server-only, sandbox-enforced.
 * Secrets never leave the server. Timeouts and unknown outcomes surface as
 * UNKNOWN; nothing is ever mapped to success without a provider confirmation.
 */

import { getServerEnv, assertSandboxPayments } from "@/lib/env";

export type PayPalError =
  | { kind: "TIMEOUT" }
  | { kind: "NETWORK"; detail: string }
  | { kind: "AUTH" }
  | { kind: "BAD_REQUEST"; detail: string; debugId?: string }
  | { kind: "UNPROCESSABLE"; detail: string; issue?: string; debugId?: string }
  | { kind: "PROVIDER_ERROR"; status: number }
  | { kind: "NOT_CONFIGURED" };

type FetchLike = typeof fetch;

export type OrderApprovalLinks = { approveUrl: string | null };

export type CreatedOrder = { id: string; status: string };

export type AuthorizationResult = {
  authorizationId: string;
  status: string;
  amount: { currencyCode: string; value: string } | null;
  expirationTime: string | null;
  orderStatus: string;
};

// Token cache is process-local with expiry margin; the secret never leaves the server.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getToken(deps?: { fetchFn?: FetchLike; now?: () => number }): Promise<string> {
  const env = getServerEnv();
  assertSandboxPayments();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw Object.assign(new Error("PayPal is not configured"), { kind: "NOT_CONFIGURED" as const });
  }
  const now = deps?.now?.() ?? Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.accessToken;

  const res = await (deps?.fetchFn ?? fetch)("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw Object.assign(new Error("PayPal OAuth failed"), { kind: "AUTH" as const });
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: body.access_token, expiresAt: now + body.expires_in * 1000 };
  return cachedToken.accessToken;
}

async function call(
  method: "POST" | "GET",
  path: string,
  opts: { requestId?: string; body?: unknown; timeoutMs?: number },
  deps?: { fetchFn?: FetchLike; now?: () => number },
): Promise<{ ok: true; json: unknown } | { ok: false; error: PayPalError }> {
  assertSandboxPayments();
  let token: string;
  try {
    token = await getToken(deps);
  } catch (err) {
    const kind = (err as { kind?: PayPalError["kind"] }).kind;
    return kind === "NOT_CONFIGURED" ? { ok: false, error: { kind: "NOT_CONFIGURED" } } : { ok: false, error: { kind: "AUTH" } };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await (deps?.fetchFn ?? fetch)(`https://api-m.sandbox.paypal.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.requestId ? { "PayPal-Request-Id": opts.requestId } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: { kind: "AUTH" } };
    let json: Record<string, unknown> = {};
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = {};
      }
    }
    if (res.status === 400) {
      return { ok: false, error: { kind: "BAD_REQUEST", detail: JSON.stringify(json).slice(0, 400), debugId: json.debug_id as string | undefined } };
    }
    if (res.status === 422) {
      const issue = (json.details as Array<{ issue?: string }> | undefined)?.[0]?.issue;
      return { ok: false, error: { kind: "UNPROCESSABLE", detail: JSON.stringify(json).slice(0, 400), issue, debugId: json.debug_id as string | undefined } };
    }
    if (res.status >= 500) return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
    if (!res.ok) return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
    return { ok: true, json };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return { ok: false, error: isTimeout ? { kind: "TIMEOUT" } : { kind: "NETWORK", detail: err instanceof Error ? err.message : "network error" } };
  } finally {
    clearTimeout(timer);
  }
}

export async function createPayPalOrder(
  input: { amountMinor: number; currency: string; referenceId: string; requestId: string; returnUrl: string; cancelUrl: string },
  deps?: { fetchFn?: FetchLike; now?: () => number },
): Promise<{ ok: true; order: CreatedOrder } | { ok: false; error: PayPalError }> {
  const result = await call(
    "POST",
    "/v2/checkout/orders",
    {
      requestId: input.requestId,
      timeoutMs: 20_000,
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: input.referenceId.slice(0, 50),
            description: "RepairRelay repair contract",
            amount: { currency_code: input.currency, value: (input.amountMinor / 100).toFixed(2) },
          },
        ],
        application_context: {
          brand_name: "RepairRelay",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
    deps,
  );
  if (!result.ok) return result;
  const json = result.json as { id?: string; status?: string };
  if (typeof json.id !== "string") return { ok: false, error: { kind: "PROVIDER_ERROR", status: 200 } };
  return { ok: true, order: { id: json.id, status: json.status ?? "CREATED" } };
}

export async function authorizeOrder(
  input: { orderId: string; requestId: string },
  deps?: { fetchFn?: FetchLike; now?: () => number },
): Promise<{ ok: true; authorization: AuthorizationResult } | { ok: false; error: PayPalError }> {
  const result = await call("POST", `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/authorize`, { requestId: input.requestId }, deps);
  if (!result.ok) return result;
  const json = result.json as {
    status?: string;
    purchase_units?: Array<{ payments?: { authorizations?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string }; expiration_time?: string | null }> } }>;
  };
  const auth = json.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (typeof auth?.id !== "string") {
    return { ok: false, error: { kind: "PROVIDER_ERROR", status: 200 } };
  }
  return {
    ok: true,
    authorization: {
      authorizationId: auth.id,
      status: auth.status ?? "UNKNOWN",
      amount: auth.amount ? { currencyCode: auth.amount.currency_code ?? "", value: auth.amount.value ?? "" } : null,
      expirationTime: auth.expiration_time ?? null,
      orderStatus: json.status ?? "UNKNOWN",
    },
  };
}

/** Order state query for reconciliation — a read, never a mutation. */
export async function getOrder(
  orderId: string,
  deps?: { fetchFn?: FetchLike; now?: () => number },
): Promise<{ ok: true; order: Record<string, unknown> } | { ok: false; error: PayPalError }> {
  const result = await call("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`, {}, deps);
  if (!result.ok) return result;
  return { ok: true, order: result.json as Record<string, unknown> };
}

/** Authorization state query for reconciliation. */
export async function getAuthorization(
  authorizationId: string,
  deps?: { fetchFn?: FetchLike; now?: () => number },
): Promise<{ ok: true; authorization: Record<string, unknown> } | { ok: false; error: PayPalError }> {
  const result = await call("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`, {}, deps);
  if (!result.ok) return result;
  return { ok: true, authorization: result.json as Record<string, unknown> };
}
