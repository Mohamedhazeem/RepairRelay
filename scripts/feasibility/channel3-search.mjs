#!/usr/bin/env node
// S0 feasibility probe — authenticated Channel3 POST /v1/search.
// Usage:
//   node --env-file=.env.local scripts/s0/channel3-search.mjs --query "Apple iPhone 13 OLED screen replacement assembly" [--limit 5] [--save slug]
// Prints a compact sanitized summary. --save stores the raw response under
// tests/fixtures/channel3/ for automated tests only — never user-facing data.

const required = ["CHANNEL3_API_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. Set them in .env.local (gitignored, never committed).`);
  process.exit(1);
}

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const query = argValue("--query");
if (!query) {
  console.error('Usage: --query "Apple iPhone 13 OLED screen replacement assembly"');
  process.exit(1);
}
const limit = Number(argValue("--limit") ?? 5);
if (!Number.isFinite(limit) || limit < 1 || limit > 25) {
  console.error("--limit must be 1..25");
  process.exit(1);
}
const saveSlug = argValue("--save");

const base = process.env.CHANNEL3_BASE_URL ?? "https://api.trychannel3.com";
const config = {
  country: process.env.CHANNEL3_COUNTRY ?? "US",
  currency: process.env.CHANNEL3_CURRENCY ?? "USD",
  language: process.env.CHANNEL3_LANGUAGE ?? "en",
  mode: process.env.CHANNEL3_SEARCH_MODE ?? "default",
};

const timeoutMs = Number(process.env.CHANNEL3_REQUEST_TIMEOUT_MS ?? 12000);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

let res;
try {
  res = await fetch(`${base}/v1/search`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.CHANNEL3_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit, config }),
    signal: controller.signal,
  });
} catch (err) {
  clearTimeout(timer);
  console.error(`NETWORK_ERROR: ${err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message}`);
  process.exit(2);
}
clearTimeout(timer);

console.log(`HTTP ${res.status} ${res.statusText}`);
const rl = {
  remaining: res.headers.get("x-ratelimit-remaining"),
  limit: res.headers.get("x-ratelimit-limit"),
  reset: res.headers.get("x-ratelimit-reset"),
  retryAfter: res.headers.get("retry-after"),
};
if (rl.remaining || rl.retryAfter) console.log(`rate-limit headers: ${JSON.stringify(rl)}`);

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.error("NON_JSON_RESPONSE (first 400 chars):", text.slice(0, 400).replace(/\s+/g, " "));
  process.exit(3);
}

if (!res.ok) {
  console.error("ERROR_BODY (sanitized, truncated):", JSON.stringify(body).slice(0, 800));
  process.exit(res.status === 401 || res.status === 403 ? 5 : 4);
}

const products = Array.isArray(body.products) ? body.products : null;
if (!products) {
  console.error("UNEXPECTED_SHAPE: no products[] array. Top-level keys:", Object.keys(body).join(", "));
  process.exit(5);
}

const token = body.next_page_token;
console.log(`query: "${query}"`);
console.log(`config: ${JSON.stringify(config)} limit: ${limit}`);
console.log(`next_page_token: ${token === undefined ? "<absent>" : token === null ? "null" : typeof token === "string" ? `"${token.slice(0, 24)}…"` : typeof token}`);
console.log(`products: ${products.length}`);

for (const [i, p] of products.entries()) {
  const offers = Array.isArray(p.offers) ? p.offers : [];
  const images = Array.isArray(p.images) ? p.images : [];
  console.log(`\n[${i}] ${p.title ?? "<no title>"}`);
  console.log(`    id: ${typeof p.id === "string" ? p.id : JSON.stringify(p.id)}`);
  if (p.category !== undefined) console.log(`    category: ${typeof p.category === "string" ? p.category : JSON.stringify(p.category)}`);
  if (p.brands !== undefined) console.log(`    brands: ${JSON.stringify(p.brands).slice(0, 140)}`);
  console.log(`    images: ${images.length}${images.length ? ` keys:${JSON.stringify(Object.keys(images[0]))}` : ""}`);
  console.log(`    structured_attributes: ${p.structured_attributes ? "present" : "absent"}`);
  console.log(`    offers: ${offers.length}`);
  for (const [j, o] of offers.entries()) {
    const price = o?.price;
    const shape =
      price === undefined ? "absent"
      : typeof price === "number" ? "number"
      : typeof price === "string" ? "string"
      : price && typeof price === "object" ? `object{${Object.keys(price).join(",")}}`
      : typeof price;
    console.log(`      offer[${j}] domain=${o?.domain ?? "<none>"} priceShape=${shape} price=${JSON.stringify(price)} currency=${o?.currency ?? "<none>"} availability=${o?.availability ?? "<none>"} condition=${o?.condition ?? "<none>"}`);
    console.log(`        url=${typeof o?.url === "string" ? o.url.slice(0, 110) : JSON.stringify(o?.url)}`);
  }
}

if (saveSlug) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const dir = "tests/fixtures/channel3";
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/s0-${saveSlug}.json`;
  writeFileSync(file, JSON.stringify(body, null, 2));
  console.log(`\nsaved raw fixture: ${file} (automated tests only — never user-facing)`);
}
