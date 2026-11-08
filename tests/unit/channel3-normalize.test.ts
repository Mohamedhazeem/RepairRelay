import { describe, expect, it } from "vitest";
import { normalizeSearchResponse, priceToMinor, pickDisplayOffer } from "../../src/integrations/channel3/normalize";
import fixture from "../../tests/fixtures/channel3/s0-iphone13-device.json";

const NOW = "2026-11-08T04:00:00.000Z";

function product(overrides: Record<string, unknown>, offer?: unknown) {
  return {
    products: [{ id: "p1", title: "iPhone 13", offers: offer === undefined ? [] : [offer] }],
    next_page_token: null,
    ...overrides,
  };
}

const goodOffer = {
  url: "https://buy.example.com/item",
  domain: "buy.example.com",
  price: { price: 241.99, compare_at_price: null, currency: "USD" },
  availability: "InStock",
  condition: "new",
};

describe("price conversion", () => {
  it("converts float dollars to rounded minor units", () => {
    expect(priceToMinor(241.99)).toBe(24199);
    expect(priceToMinor(20.2)).toBe(2020);
    expect(priceToMinor(5)).toBe(500);
  });
  it("rejects zero, negative, non-finite", () => {
    expect(priceToMinor(0)).toBeNull();
    expect(priceToMinor(-1)).toBeNull();
    expect(priceToMinor(Number.NaN)).toBeNull();
    expect(priceToMinor(Infinity)).toBeNull();
  });
});

describe("normalizeSearchResponse", () => {
  it("normalizes the real S0 captured fixture", () => {
    const result = normalizeSearchResponse(fixture, NOW);
    expect(result.candidates.length).toBeGreaterThan(0);
    const withOffer = result.candidates.find((c) => c.selectionEligible);
    expect(withOffer).toBeDefined();
    expect(withOffer!.offers[0].priceMinor).toBeGreaterThan(0);
    expect(withOffer!.offers[0].currency).toBe("USD");
    expect(withOffer!.offers[0].observedAt).toBe(NOW);
  });

  it("prefers cleaned_url and requires https for images", () => {
    const result = normalizeSearchResponse(
      product({
        products: [
          {
            id: "p1",
            title: "t",
            images: [
              { url: "http://insecure/img", cleaned_url: "https://clean/img" },
              { url: "https://second/img" },
            ],
          },
        ],
      }),
      NOW,
    );
    expect(result.candidates[0].imageUrl).toBe("https://clean/img");
    const noHttps = normalizeSearchResponse(product({ products: [{ id: "p2", title: "t", images: [{ url: "http://x/y" }] }] }), NOW);
    expect(noHttps.candidates[0].imageUrl).toBeNull();
  });

  it("marks ineligible: no offer, missing price, wrong currency, zero price, bad url, missing domain, out of stock", () => {
    const cases: Array<[unknown, string]> = [
      [{}, "no offer at all"],
      [{ url: "https://e.com/x", domain: "e.com", price: null }, "null price"],
      [{ url: "https://e.com/x", domain: "e.com", price: { price: 10, currency: "EUR" } }, "wrong currency"],
      [{ url: "https://e.com/x", domain: "e.com", price: { price: 0, currency: "USD" } }, "zero price"],
      [{ url: "http://e.com/x", domain: "e.com", price: { price: 10, currency: "USD" } }, "insecure url"],
      [{ url: "https://e.com/x", price: { price: 10, currency: "USD" } }, "missing domain"],
      [{ url: "https://e.com/x", domain: "e.com", price: { price: 10, currency: "USD" }, availability: "OutOfStock" }, "out of stock"],
      [{ url: "https://e.com/x", domain: "e.com", price: { price: "From $45", currency: "USD" } }, "string price"],
    ];
    for (const [offer, label] of cases) {
      const result = normalizeSearchResponse(product({}, offer), NOW);
      expect(result.candidates[0].selectionEligible, label).toBe(false);
    }
  });

  it("keeps optional fields optional and handles next_page_token variants", () => {
    const minimal = normalizeSearchResponse({ products: [{ id: "a", title: "A" }], next_page_token: null }, NOW);
    expect(minimal.candidates[0].description).toBeNull();
    expect(minimal.candidates[0].imageUrl).toBeNull();
    expect(minimal.nextPageToken).toBeNull();

    const paged = normalizeSearchResponse({ products: [], next_page_token: "tok" }, NOW);
    expect(paged.nextPageToken).toBe("tok");
    const badToken = normalizeSearchResponse({ products: [], next_page_token: 42 }, NOW);
    expect(badToken.candidates).toHaveLength(0);
    expect(badToken.nextPageToken).toBeNull();
  });

  it("fails closed on unexpected provider structure", () => {
    expect(() => normalizeSearchResponse({ nope: true }, NOW)).toThrow();
    expect(() => normalizeSearchResponse(null, NOW)).toThrow();
    expect(() => normalizeSearchResponse({ products: "many" }, NOW)).toThrow();
  });

  it("does not mix another offer's price across products", () => {
    const result = normalizeSearchResponse(
      {
        products: [
          { id: "a", title: "A", offers: [goodOffer] },
          { id: "b", title: "B", offers: [] },
        ],
      },
      NOW,
    );
    expect(result.candidates[1].offers).toHaveLength(0);
    expect(result.candidates[1].selectionEligible).toBe(false);
    expect(result.candidates[0].offers[0].priceMinor).toBe(24199);
  });

  it("pickDisplayOffer prefers eligible offers", () => {
    const result = normalizeSearchResponse(
      {
        products: [
          {
            id: "a",
            title: "A",
            offers: [
              { url: "https://e.com/oos", domain: "e.com", price: { price: 1, currency: "USD" }, availability: "OutOfStock" },
              goodOffer,
            ],
          },
        ],
      },
      NOW,
    );
    expect(pickDisplayOffer(result.candidates[0])?.priceMinor).toBe(24199);
  });
});
