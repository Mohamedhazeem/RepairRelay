/**
 * Channel3 REST client (S02 scope): server-only key, timeout, bounded 429 retry.
 * Error outcomes are typed and mapped to the shared API envelope upstream.
 */

import { getServerEnv } from "@/lib/env";
import { RawSearchResponseSchema, type RawSearchResponse } from "@/integrations/channel3/schema";

export type Channel3SearchConfig = { country: string; currency: string; language: string; mode: string };

export type Channel3Error =
  | { kind: "TIMEOUT" }
  | { kind: "NETWORK"; detail: string }
  | { kind: "AUTH" }
  | { kind: "BAD_REQUEST"; detail: string }
  | { kind: "RATE_LIMITED"; retryAfterSeconds: number }
  | { kind: "PROVIDER_ERROR"; status: number }
  | { kind: "MALFORMED"; detail: string }
  | { kind: "NOT_CONFIGURED" };

type FetchLike = typeof fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(
  method: "POST" | "GET",
  path: string,
  body?: unknown,
  deps?: { fetchFn?: FetchLike; timeoutMs?: number; maxRetries?: number; sleepFn?: (ms: number) => Promise<void> },
): Promise<{ ok: true; json: unknown } | { ok: false; error: Channel3Error }> {
  const env = getServerEnv();
  if (!env.CHANNEL3_API_KEY) return { ok: false, error: { kind: "NOT_CONFIGURED" } };

  const fetchFn = deps?.fetchFn ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? env.CHANNEL3_REQUEST_TIMEOUT_MS;
  const maxRetries = deps?.maxRetries ?? 2;
  const doze = deps?.sleepFn ?? sleep;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`https://api.trychannel3.com${path}`, {
        method,
        headers: { "x-api-key": env.CHANNEL3_API_KEY, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      return { ok: false, error: isTimeout ? { kind: "TIMEOUT" } : { kind: "NETWORK", detail: err instanceof Error ? err.message : "network error" } };
    }
    clearTimeout(timer);

    if (res.status === 429) {
      if (attempt >= maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 5);
        return { ok: false, error: { kind: "RATE_LIMITED", retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 5 } };
      }
      const retryAfter = Number(res.headers.get("retry-after") ?? 5);
      const jitter = Math.floor(Math.random() * 250);
      await doze((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000) + jitter);
      continue;
    }

    if (res.status === 401 || res.status === 403) return { ok: false, error: { kind: "AUTH" } };
    if (res.status === 400) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: { kind: "BAD_REQUEST", detail } };
    }
    if (res.status >= 500) {
      if (attempt >= maxRetries) return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
      await doze(500 * (attempt + 1));
      continue;
    }
    if (!res.ok) return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: { kind: "MALFORMED", detail: "Response was not JSON" } };
    }
    return { ok: true, json };
  }
  return { ok: false, error: { kind: "PROVIDER_ERROR", status: 0 } };
}

export async function searchProducts(
  query: string,
  limit: number,
  deps?: Parameters<typeof call>[3],
): Promise<{ ok: true; data: RawSearchResponse } | { ok: false; error: Channel3Error }> {
  const env = getServerEnv();
  const result = await call(
    "POST",
    "/v1/search",
    {
      query,
      limit,
      config: {
        country: env.CHANNEL3_COUNTRY,
        currency: env.CHANNEL3_CURRENCY,
        language: env.CHANNEL3_LANGUAGE,
        mode: env.CHANNEL3_SEARCH_MODE,
      },
    },
    deps,
  );
  if (!result.ok) return result;
  const parsed = RawSearchResponseSchema.safeParse(result.json);
  if (!parsed.success) {
    return { ok: false, error: { kind: "MALFORMED", detail: "Unexpected search response structure" } };
  }
  return { ok: true, data: parsed.data };
}

export async function productDetail(
  productId: string,
  deps?: Parameters<typeof call>[3],
): Promise<{ ok: true; data: { product: Record<string, unknown> | null } } | { ok: false; error: Channel3Error }> {
  const result = await call("GET", `/v1/products/${encodeURIComponent(productId)}`, undefined, deps);
  if (!result.ok) return result;
  // Detail returns product fields at the top level (per captured S0 fixture).
  const top = result.json as Record<string, unknown>;
  const product = typeof top.id === "string" ? top : ((top.product as Record<string, unknown> | undefined) ?? null);
  return { ok: true, data: { product } };
}
