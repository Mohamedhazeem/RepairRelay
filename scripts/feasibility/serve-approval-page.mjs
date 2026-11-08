#!/usr/bin/env node
// Serves paypal-approval-page.html on http://localhost:3100 for the S0 buyer-approval probe.
// Usage: node scripts/feasibility/serve-approval-page.mjs [--port 3100]
// No dependencies; never used by the product app.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const htmlTemplate = readFileSync(join(here, "paypal-approval-page.html"), "utf8");
const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 3100;

createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  // Inject the public client id from .env.local when the URL omits it (client id is public by design).
  const html = htmlTemplate.replaceAll("__DEFAULT_CLIENT_ID__", process.env.PAYPAL_CLIENT_ID ?? "");
  // Query string (clientId/orderId) is preserved by serving the page on every path.
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`S0 approval page: http://127.0.0.1:${port}/?orderId=<ORDER_ID>`);
  console.log("Stop with Ctrl+C.");
});
