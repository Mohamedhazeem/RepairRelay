# RepairRelay — Channel3 Integration Contract

**Purpose:** real product discovery for replacement components and, if needed, replacement devices. Channel3 is not the compatibility engine, the repairer marketplace, or the payment checkout.

## 1. Official references

- API docs: https://channel3.ai/docs
- Search reference: https://channel3.ai/docs/api-reference/v1/search
- Search guide: https://channel3.ai/docs/guides/make-a-search
- Response overview: https://channel3.ai/docs/guides/response-overview
- Official integration skill: https://github.com/channel3-ai/skills
- Developer portal: https://trychannel3.com/developers
- Channel3 caching guide: https://channel3.ai/docs/guides/caching (verify current URL if docs navigation changes)

Documentation reviewed 8 November 2026. Live authenticated requests remain unverified until the user's own key is tested.

## 2. Product role

Channel3 provides retail product discovery and offer data. RepairRelay uses it to find candidate replacement parts and compare current retailer offers. Channel3 does not certify device fitment, OEM origin, product quality, repairer inventory or installation.

The repairer attestation is simulated in the hackathon demo and is a separate data point from Channel3 search relevance.

## 3. REST request

Documented API base: `https://api.trychannel3.com`

Endpoint: `POST /v1/search`

Headers:

```http
x-api-key: <CHANNEL3_API_KEY>
Content-Type: application/json
```

Initial feasibility request:

```bash
curl -sS -X POST \
  "https://api.trychannel3.com/v1/search" \
  -H "x-api-key: $CHANNEL3_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Apple iPhone 13 OLED screen replacement assembly",
    "limit": 5,
    "config": {
      "country": "US",
      "currency": "USD",
      "language": "en",
      "mode": "default"
    }
  }'
```

The published guide documents top-level `query`, `limit` and `config`, with locale/mode inside `config`. Verify with a live request before implementation. Do not silently accept unexpected default locale if config validation fails.

## 4. Search modes

- `default`: lexical + semantic search; use for primary product discovery and recorded demo.
- `agentic`: interprets complex natural-language search intent and may take several seconds / perform multiple searches. Not suitable for the critical recorded flow until latency and credit use are measured.
- `keyword`: lexical search; optional latency optimization, but do not use unless it improves actual results.

## 5. Locale

Use `country=US`, `currency=USD`, `language=en` for the hackathon product demo. Published supported locales/currencies include the US and several other markets but do not list India/INR. Do not display Indian localized pricing or claim Indian merchant availability from this integration.

## 6. Response and normalization

Documented response uses `products[]` and `next_page_token`. Product fields may include:
- `id`, `title`, `description`, `brands`, `images`, `category`, `offers`, `variants`, `structured_attributes`.

Offer fields may include:
- `url`, `domain`, `price`, `availability`, `condition`.

Use `images[].cleaned_url` when present, else `images[].url`; image is optional.

**Important schema caution:** documentation examples have shown more than one inner price shape across response examples (for example `price.price` vs `price.amount`). Do not hard-code an illustrative model without checking your real response. Build a normalizer that:

1. validates the raw object;
2. accepts only explicitly observed/documented price shapes;
3. converts a finite positive numeric amount and supported currency into integer minor units;
4. records which schema branch matched for diagnostics;
5. rejects unknown shapes, non-numeric amounts, missing currency or currency mismatch;
6. never substitutes another offer's price accidentally.

Do not coerce strings such as `"From $45"` into prices unless a separately approved parsing rule exists. If price is ambiguous, mark the candidate non-selectable.

### Normalized application product

```ts
export type NormalizedProductCandidate = {
  channel3ProductId: string;
  title: string;
  description?: string;
  brandNames: string[];
  imageUrl?: string;
  structuredAttributes?: Record<string, unknown>;
  offers: NormalizedOffer[];
};

export type NormalizedOffer = {
  domain: string;
  url: string;
  priceMinor?: number;
  currency?: "USD";
  availability?: "InStock" | "OutOfStock" | "UNKNOWN";
  condition?: "new" | "used" | "refurbished" | "UNKNOWN";
  observedAt: string;
  selectionEligible: boolean;
};
```

This is an application contract, not a claim that Channel3 returns exactly this TypeScript structure.

## 7. Feasibility queries

Use 5–10 results per query initially to conserve credits. Test:

1. `Apple iPhone 13 OLED screen replacement assembly`
2. `iPhone 13 OLED display digitizer replacement`
3. `iPhone 13 replacement screen assembly refurbished`
4. `Apple iPhone 13 replacement battery assembly`
5. `Samsung Galaxy S23 OLED screen replacement assembly`
6. `Refurbished unlocked Apple iPhone 13`

Optional negative control: `iPhone 13 LCD screen replacement`. iPhone 13 uses OLED technology; an LCD search is not a positive part-coverage test. Inspect irrelevant or misleading results rather than counting them as valid.

### GO condition

At least two distinct, genuinely relevant component products with usable current merchant offers (positive price, USD, domain, URL, and meaningful product identity). Three candidates are preferable for an engaging comparison.

### PIVOT condition

If no selected device has sufficient replacement component coverage, change to the Repair-versus-Replace mode using live Channel3 replacement-device offers. Make the product pitch and contract label reflect the pivot; do not claim a selected repair component is Channel3-backed.

## 8. Product detail refresh and caching policy

The official product detail pattern is `GET /v1/products/{product_id}`; confirm current auth/header and exact response shape in the live API docs at implementation time.

Channel3's caching guidance distinguishes stable product IDs from volatile retail fields:

- Stable product IDs may be stored as references.
- Do not show cached prices, offer URLs, availability, images or product descriptions as live/current.
- Refresh product details/offers before user display, selection and final contract approval as appropriate.
- A test fixture can be stored in the repository for automated adapter tests but must never be used as a user-facing fallback.
- If live search/detail fails, show the real error/empty state. Do not resurrect stale offers.

For audit, the accepted contract may record a small immutable historical snapshot of what the customer agreed to at approval time, subject to Channel3 terms. This is an historical contract record, not current catalog data and must not be presented as a live offer.

## 9. Credits and rate limits

- Promotional hackathon key: 20,000 credits using `PAYPAL-HACKATHON-2026` (per official sponsor/hackathon page).
- Published pricing indicates a normal product search is 1 credit; verify dashboard usage after first call.
- New-key default published rate limits include approximately 10 requests/second on search; daily quota 10,000. Respect any actual response headers and account-specific limits.
- On `429`, respect `Retry-After` (documentation examples mention 5 seconds); retry at most twice with jitter for interactive calls.
- Avoid broad repeated queries and unneeded `agentic` mode.
- Do not claim MCP use unless an MCP integration is actually built and exercised. Direct meaningful `/v1/search` API use meets the API route described by the sponsor.

## 10. Error handling

| Provider outcome | Application behavior |
|---|---|
| 200 with products | Validate and normalize; only eligible offers can be selected |
| 200 empty products | `PARTS_EMPTY`; refine query or execute documented pivot |
| Product lacks offer | Informational card; selection disabled |
| Offer lacks price/currency/domain/URL | Selection disabled; explain missing offer data |
| 400 | Log sanitized validation details; fix query/config; no blind retry |
| 401/403 | Mark integration blocked; verify API key/account access |
| 404 product on refresh | Mark candidate unavailable; ask customer to choose another |
| 429 | Respect Retry-After; bounded retry |
| 5xx/network timeout | Show recoverable dependency error; user can retry |
| Malformed/unexpected JSON | Fail closed; preserve diagnostic log without rendering untrusted payload |

## 11. Implementation checklist

- [ ] Obtain key and keep it server-only.
- [ ] Run one authenticated curl before writing product-card code.
- [ ] Save sanitized response fixture for tests only.
- [ ] Record actual `products`, `offers`, image and price shape.
- [ ] Write Zod parser against actual response with optional fields.
- [ ] Implement normalized adapter and parser unit tests.
- [ ] Run six feasibility searches and record results/credits.
- [ ] Choose parts-referenced or repair-versus-replace path.
- [ ] Implement product detail refresh and stale-data rules.
- [ ] Verify no stale retail prices/links are shown after refresh failure.
