/**
 * Normalizer (S02 scope): raw Channel3 response → application candidates.
 * Rules (CHANNEL3.md §6): only explicitly observed price shapes; finite positive
 * amount × USD → minor units; unknown shapes fail closed; relevance is NOT
 * compatibility; offers without a usable price/domain/URL are never selectable.
 */

import { z } from "zod";
import type { RawOffer } from "@/integrations/channel3/schema";
import { RawProductSchema, RawOfferSchema } from "@/integrations/channel3/schema";

export const NORMALIZATION_VERSION = 1;

export type NormalizedOffer = {
  domain: string;
  url: string;
  priceMinor: number | null;
  currency: "USD" | null;
  availability: "InStock" | "OutOfStock" | "UNKNOWN";
  condition: "new" | "used" | "refurbished" | "UNKNOWN";
  observedAt: string;
  selectionEligible: boolean;
};

export type NormalizedCandidate = {
  channel3ProductId: string;
  title: string;
  description: string | null;
  brandNames: string[];
  imageUrl: string | null;
  offers: NormalizedOffer[];
  /** True when at least one offer is currently selectable. */
  selectionEligible: boolean;
};

export type NormalizeResult = {
  candidates: NormalizedCandidate[];
  droppedProducts: number;
  nextPageToken: string | null;
};

function toAvailability(value: string | null | undefined): NormalizedOffer["availability"] {
  if (value === "InStock") return "InStock";
  if (value === "OutOfStock") return "OutOfStock";
  return "UNKNOWN";
}

function toCondition(value: string | null | undefined): NormalizedOffer["condition"] {
  if (value === "new" || value === "used" || value === "refurbished") return value;
  return "UNKNOWN";
}

/** Float dollars → integer minor units, rounded once; rejects non-finite/non-positive. */
export function priceToMinor(price: number): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const minor = Math.round(price * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function normalizeOffer(raw: RawOffer, observedAt: string): NormalizedOffer {
  const httpsUrl = raw.url && /^https:\/\//i.test(raw.url) ? raw.url : null;
  const domain = raw.domain?.trim() ? raw.domain.trim() : null;

  // Only the observed price shape {price, compare_at_price?, currency} is accepted.
  const priceObj = raw.price && typeof raw.price === "object" ? raw.price : null;
  const priceMinor = priceObj ? priceToMinor(priceObj.price) : null;
  const currency = priceObj && priceObj.currency === "USD" ? ("USD" as const) : null;

  const availability = toAvailability(raw.availability);
  const selectionEligible =
    httpsUrl !== null &&
    domain !== null &&
    priceMinor !== null &&
    currency === "USD" &&
    availability !== "OutOfStock";

  return {
    domain: domain ?? "",
    url: httpsUrl ?? "",
    priceMinor,
    currency,
    availability,
    condition: toCondition(raw.condition),
    observedAt,
    selectionEligible,
  };
}

export function normalizeSearchResponse(body: unknown, observedAt: string): NormalizeResult {
  // Fail closed on the envelope; malformed individual products are dropped, not trusted.
  const envelope = z
    .object({ products: z.array(z.unknown()), next_page_token: z.unknown().optional() })
    .parse(body);
  const candidates: NormalizedCandidate[] = [];
  let dropped = 0;

  for (const raw of envelope.products) {
    const parsedProduct = RawProductSchema.safeParse(raw);
    if (!parsedProduct.success) {
      dropped += 1;
      continue;
    }
    const product = parsedProduct.data;
    const offers: NormalizedOffer[] = [];
    for (const offer of product.offers ?? []) {
      const parsedOffer = RawOfferSchema.safeParse(offer);
      if (!parsedOffer.success) continue; // unknown offer shape → dropped, fail closed
      offers.push(normalizeOffer(parsedOffer.data, observedAt));
    }
    const image = (product.images ?? []).find((i) => i.is_main_image) ?? product.images?.[0];
    const rawImageUrl = image?.cleaned_url || image?.url || null;
    const imageUrl = rawImageUrl && /^https:\/\//i.test(rawImageUrl) ? rawImageUrl : null;

    candidates.push({
      channel3ProductId: product.id,
      title: product.title,
      description: product.description ?? null,
      brandNames: (product.brands ?? []).map((b) => b.name ?? "").filter(Boolean),
      imageUrl,
      offers,
      selectionEligible: offers.some((o) => o.selectionEligible),
    });
  }

  return { candidates, droppedProducts: dropped, nextPageToken: typeof envelope.next_page_token === "string" ? envelope.next_page_token : null };
}

/** Pick the display offer for a candidate: first eligible, else first observed. */
export function pickDisplayOffer(candidate: NormalizedCandidate): NormalizedOffer | null {
  return candidate.offers.find((o) => o.selectionEligible) ?? candidate.offers[0] ?? null;
}
