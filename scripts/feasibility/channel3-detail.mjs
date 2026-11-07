#!/usr/bin/env node
// S0 feasibility probe — Channel3 product detail refresh (GET /v1/products/{id}).
// Usage:
//   node --env-file=.env.local scripts/feasibility/channel3-detail.mjs --id <channel3_product_id> [--save slug]
// Confirms current offer/price fields and auth header before product-card code exists.

const required = ["CHANNEL3_API_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. Set them in .env.local (gitignored, never committed).`);
  process.exit(1);
}

const args = process.argv.slice(2);
const idIdx = args.indexOf("--id");
const productId = idIdx >= 0 ? args[idIdx + 1] : undefined;
if (!productId) {
  console.error("Usage: --id <channel3_product_id>");
  process.exit(1);
}
const saveSlug = args.indexOf("--save") >= 0 ? args[args.indexOf("--save") + 1] : undefined;

const base = process.env.CHANNEL3_BASE_URL ?? "https://api.trychannel3.com";
const timeoutMs = Number(process.env.CHANNEL3_REQUEST_TIMEOUT_MS ?? 12000);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

let res;
try {
  res = await fetch(`${base}/v1/products/${encodeURIComponent(productId)}`, {
    method: "GET",
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY },
    signal: controller.signal,
  });
} catch (err) {
  clearTimeout(timer);
  console.error(`NETWORK_ERROR: ${err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message}`);
  process.exit(2);
}
clearTimeout(timer);

console.log(`HTTP ${res.status} ${res.statusText}`);
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
  process.exit(res.status === 404 ? 6 : 4);
}

console.log("top-level keys:", Object.keys(body).join(", "));
const p = body.product ?? body;
console.log(`id: ${p.id ?? "<absent>"}`);
console.log(`title: ${p.title ?? "<absent>"}`);
const offers = Array.isArray(p.offers) ? p.offers : [];
console.log(`offers: ${offers.length}`);
for (const [j, o] of offers.entries()) {
  const price = o?.price;
  const shape =
    price === undefined ? "absent"
    : typeof price === "number" ? "number"
    : typeof price === "string" ? "string"
    : price && typeof price === "object" ? `object{${Object.keys(price).join(",")}}`
    : typeof price;
  console.log(`  offer[${j}] domain=${o?.domain ?? "<none>"} priceShape=${shape} price=${JSON.stringify(price)} currency=${o?.currency ?? "<none>"} availability=${o?.availability ?? "<none>"} condition=${o?.condition ?? "<none>"}`);
  console.log(`    url=${typeof o?.url === "string" ? o.url.slice(0, 110) : JSON.stringify(o?.url)}`);
}

if (saveSlug) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const dir = "tests/fixtures/channel3";
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/s0-detail-${saveSlug}.json`;
  writeFileSync(file, JSON.stringify(body, null, 2));
  console.log(`\nsaved raw fixture: ${file} (automated tests only — never user-facing)`);
}
