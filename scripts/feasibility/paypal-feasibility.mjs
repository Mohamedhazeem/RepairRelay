#!/usr/bin/env node
// S0 feasibility probe — PayPal sandbox OAuth + Orders v2 authorize + Payments v2 capture/void.
//
// Subcommands:
//   oauth                                verify client credentials / token issuance
//   create-order --amount 95.00          create one purchase-unit order, intent=AUTHORIZE
//   show-order   --order <id>            GET order state (reconciliation probe)
//   authorize    --order <id>            authorize after buyer approval (JS SDK page)
//   show-auth    --auth <id>             GET authorization state (reconciliation probe)
//   capture     --auth <id>              capture an authorization
//   void        --auth <id>              void an uncaptured authorization
//
// Usage: node --env-file=.env.local scripts/feasibility/paypal-feasibility.mjs <subcommand> [flags]
// Secrets are never printed. Provider request IDs are persisted under data/feasibility/ before each
// outbound mutation so a retry after a lost response reuses the same idempotency key.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const required = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. Set them in .env.local (gitignored, never committed).`);
  process.exit(1);
}

const base = process.env.PAYPAL_ENV === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
if (process.env.PAYPAL_ENV === "production") {
  console.error("REFUSING: PAYPAL_ENV=production. This probe is sandbox-only.");
  process.exit(1);
}

const STATE_DIR = "data/feasibility";
function loadState() {
  try {
    return JSON.parse(readFileSync(`${STATE_DIR}/paypal-state.json`, "utf8"));
  } catch {
    return {};
  }
}
function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(`${STATE_DIR}/paypal-state.json`, JSON.stringify(state, null, 2));
}

// Stable PayPal-Request-Id per semantic operation: orders keyed by amount, mutations keyed by target id.
function stableRequestId(kind, key) {
  const state = loadState();
  state.requestIds ??= {};
  const slot = state.requestIds[kind] ??= {};
  if (!slot[key]) slot[key] = randomUUID();
  saveState(state);
  return slot[key];
}

const tokenCachePath = `${STATE_DIR}/paypal-token.json`;
async function getToken() {
  if (existsSync(tokenCachePath)) {
    try {
      const cached = JSON.parse(readFileSync(tokenCachePath, "utf8"));
      if (cached.expiresAt > Date.now() + 60_000) return cached.accessToken;
    } catch {
      // fall through to refresh
    }
  }
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  console.log(`oauth: HTTP ${res.status} ${res.statusText}`);
  if (!res.ok) {
    console.error("oauth failed — check PAYPAL_CLIENT_ID/SECRET and sandbox environment.");
    process.exit(4);
  }
  const body = await res.json();
  const accessToken = body.access_token;
  const expiresAt = Date.now() + (Number(body.expires_in ?? 0) - 120) * 1000;
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(tokenCachePath, JSON.stringify({ accessToken, expiresAt })); // local only, gitignored
  console.log(`oauth: OK scope-present=${Boolean(body.scope)} expires_in=${body.expires_in}s`);
  return accessToken;
}

async function call(method, path, { body, requestId } = {}) {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJson: text.slice(0, 200) };
  }
  return { status: res.status, statusText: res.statusText, json };
}

function printLinks(json) {
  for (const l of json?.links ?? []) console.log(`  link[${l.rel}]: ${l.method ?? "GET"} ${l.href}`);
}

const [sub, ...rest] = process.argv.slice(2);
function argValue(name) {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

switch (sub) {
  case "oauth": {
    await getToken();
    break;
  }

  case "create-order": {
    const amount = argValue("--amount") ?? "95.00";
    if (!/^\d+\.\d{2}$/.test(amount)) {
      console.error("--amount must be a decimal string like 95.00");
      process.exit(1);
    }
    const requestId = stableRequestId("create-order", `USD:${amount}`);
    const r = await call("POST", "/v2/checkout/orders", {
      requestId,
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: "REPAIRRELAY-S0",
            description: "RepairRelay S0 feasibility order",
            amount: { currency_code: "USD", value: amount },
          },
        ],
      },
    });
    console.log(`create-order: HTTP ${r.status} ${r.statusText}`);
    if (r.status === 201) {
      console.log(`  order id: ${r.json.id}`);
      console.log(`  intent: ${r.json.intent} status: ${r.json.status}`);
      printLinks(r.json);
      console.log(`  (PayPal-Request-Id reused on retry: yes)`);
    } else {
      console.error("  body:", JSON.stringify(r.json).slice(0, 900));
    }
    break;
  }

  case "show-order": {
    const orderId = argValue("--order");
    if (!orderId) { console.error("Usage: show-order --order <id>"); process.exit(1); }
    const r = await call("GET", `/v2/checkout/orders/${orderId}`);
    console.log(`show-order: HTTP ${r.status} ${r.statusText}`);
    if (r.json) {
      console.log(`  status: ${r.json.status} intent: ${r.json.intent}`);
      const pu = r.json.purchase_units?.[0];
      console.log(`  amount: ${JSON.stringify(pu?.amount)}`);
      const auth = pu?.payments?.authorizations?.[0];
      if (auth) console.log(`  authorization: id=${auth.id} status=${auth.status} amount=${JSON.stringify(auth.amount)} expiry=${auth.expiration_time ?? "<none>"}`);
      printLinks(r.json);
    }
    break;
  }

  case "authorize": {
    const orderId = argValue("--order");
    if (!orderId) { console.error("Usage: authorize --order <id>"); process.exit(1); }
    const requestId = stableRequestId("authorize", orderId);
    const r = await call("POST", `/v2/checkout/orders/${orderId}/authorize`, { requestId });
    console.log(`authorize: HTTP ${r.status} ${r.statusText}`);
    if (r.status === 201) {
      const auth = r.json.purchase_units?.[0]?.payments?.authorizations?.[0];
      console.log(`  order status: ${r.json.status}`);
      console.log(`  authorization id: ${auth?.id}`);
      console.log(`  authorization status: ${auth?.status}`);
      console.log(`  amount: ${JSON.stringify(auth?.amount)}`);
      console.log(`  expiry: ${auth?.expiration_time ?? "<none>"}`);
    } else {
      console.error("  body:", JSON.stringify(r.json).slice(0, 900));
      const issue = r.json?.details?.[0]?.issue ?? r.json?.details?.[0]?.description ?? r.json?.message;
      if (issue) console.error(`  issue: ${issue}`);
    }
    break;
  }

  case "show-auth": {
    const authId = argValue("--auth");
    if (!authId) { console.error("Usage: show-auth --auth <id>"); process.exit(1); }
    const r = await call("GET", `/v2/payments/authorizations/${authId}`);
    console.log(`show-auth: HTTP ${r.status} ${r.statusText}`);
    if (r.json) {
      console.log(`  status: ${r.json.status}`);
      console.log(`  amount: ${JSON.stringify(r.json.amount)}`);
      console.log(`  expiration_time: ${r.json.expiration_time ?? "<none>"}`);
      console.log(`  links present: ${Array.isArray(r.json.links)}`);
    }
    break;
  }

  case "capture": {
    const authId = argValue("--auth");
    if (!authId) { console.error("Usage: capture --auth <id>"); process.exit(1); }
    const requestId = stableRequestId("capture", authId);
    const r = await call("POST", `/v2/payments/authorizations/${authId}/capture`, { requestId, body: {} });
    console.log(`capture: HTTP ${r.status} ${r.statusText}`);
    const cap = r.json?.purchase_units?.[0]?.payments?.captures?.[0] ?? r.json;
    if (r.status === 201) {
      console.log(`  capture id: ${cap.id}`);
      console.log(`  capture status: ${cap.status}`);
      console.log(`  amount: ${JSON.stringify(cap.amount)}`);
    } else {
      console.error("  body:", JSON.stringify(r.json).slice(0, 900));
    }
    break;
  }

  case "void": {
    const authId = argValue("--auth");
    if (!authId) { console.error("Usage: void --auth <id>"); process.exit(1); }
    const requestId = stableRequestId("void", authId);
    const r = await call("POST", `/v2/payments/authorizations/${authId}/void`, { requestId });
    console.log(`void: HTTP ${r.status} ${r.statusText}`);
    console.log(`  (200 = confirmed void; verify with: show-auth --auth ${authId})`);
    if (r.status !== 204 && r.json) console.error("  body:", JSON.stringify(r.json).slice(0, 500));
    break;
  }

  default:
    console.error("Subcommands: oauth | create-order | show-order | authorize | show-auth | capture | void");
    process.exit(1);
}
