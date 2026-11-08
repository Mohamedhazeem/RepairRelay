import { describe, expect, it } from "vitest";
import { searchProducts, productDetail } from "../../src/integrations/channel3/client";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const searchEnvelope = { products: [{ id: "p1", title: "iPhone 13" }], next_page_token: null };

describe("Channel3 client error mapping (injected fetch)", () => {
  it("maps 401/403 to AUTH", async () => {
    const fetchFn = (async () => new Response("denied", { status: 403 })) as typeof fetch;
    const res = await searchProducts("q", 5, { fetchFn });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("AUTH");
  });

  it("retries 429 with Retry-After then succeeds", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      if (calls === 1) return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });
      return okResponse(searchEnvelope);
    }) as typeof fetch;
    const res = await searchProducts("q", 5, { fetchFn, sleepFn: async () => undefined });
    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
  });

  it("gives up after bounded 429 retries", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });
    }) as typeof fetch;
    const res = await searchProducts("q", 5, { fetchFn, sleepFn: async () => undefined });
    expect(calls).toBe(3); // initial + 2 retries
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("RATE_LIMITED");
  });

  it("maps 500 (after retries) and timeout and malformed JSON", async () => {
    const failing = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const res500 = await searchProducts("q", 5, { fetchFn: failing, sleepFn: async () => undefined });
    expect(res500.ok).toBe(false);
    if (!res500.ok) expect(res500.error.kind).toBe("PROVIDER_ERROR");

    const aborting = (async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as typeof fetch;
    const resTimeout = await searchProducts("q", 5, { fetchFn: aborting });
    expect(resTimeout.ok).toBe(false);
    if (!resTimeout.ok) expect(resTimeout.error.kind).toBe("TIMEOUT");

    const garbage = (async () => new Response("<html>not json</html>", { status: 200 })) as typeof fetch;
    const resMalformed = await searchProducts("q", 5, { fetchFn: garbage });
    expect(resMalformed.ok).toBe(false);
    if (!resMalformed.ok) expect(resMalformed.error.kind).toBe("MALFORMED");
  });

  it("fails closed on unexpected structure and returns 404 for missing detail products", async () => {
    const wrongShape = (async () => okResponse({ items: [] })) as typeof fetch;
    const res = await searchProducts("q", 5, { fetchFn: wrongShape });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("MALFORMED");

    const missing = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    const detail = await productDetail("nope", { fetchFn: missing });
    expect(detail.ok).toBe(false);
    if (!detail.ok) expect(detail.error.kind).toBe("PROVIDER_ERROR");
  });
});
