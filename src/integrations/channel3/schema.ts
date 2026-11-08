/**
 * Channel3 raw response schemas, written against the S0 captured fixtures
 * (VERIFICATION-LOG V-002). Optional fields stay optional; the envelope fails
 * closed. Individual malformed products are dropped with a count, not trusted.
 */

import { z } from "zod";

export const RawPriceSchema = z.object({
  price: z.number(),
  compare_at_price: z.number().nullable().optional(),
  currency: z.string(),
});

export const RawOfferSchema = z.object({
  url: z.string().optional(),
  domain: z.string().optional(),
  price: RawPriceSchema.nullable().optional(),
  availability: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
});

export const RawImageSchema = z.object({
  url: z.string().nullable().optional(),
  cleaned_url: z.string().nullable().optional(),
  is_main_image: z.boolean().nullable().optional(),
  shot_type: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
});

export const RawProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  brands: z.array(z.object({ id: z.string().optional(), name: z.string().optional() })).nullable().optional(),
  images: z.array(RawImageSchema).nullable().optional(),
  // Offers are validated individually in the normalizer so one bad offer
  // disables that offer instead of discarding the whole product.
  offers: z.array(z.unknown()).nullable().optional(),
});

export const RawSearchResponseSchema = z.object({
  products: z.array(RawProductSchema),
  next_page_token: z.string().nullable().optional(),
});

export type RawSearchResponse = z.infer<typeof RawSearchResponseSchema>;
export type RawProduct = z.infer<typeof RawProductSchema>;
export type RawOffer = z.infer<typeof RawOfferSchema>;
