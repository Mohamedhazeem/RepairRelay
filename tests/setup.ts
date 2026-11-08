/**
 * Loads .env.local into process.env for tests (Vitest does not read Next env files).
 * Values are never printed. DATABASE_URL can be overridden with TEST_DATABASE_URL.
 */

import { readFileSync } from "node:fs";

try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // .env.local is optional in CI; tests that need it will fail with clear messages.
}

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "test-only-secret-value-0123456789abcdef";
if (!process.env.DATABASE_URL) {
  throw new Error("Tests need DATABASE_URL (set it in .env.local or TEST_DATABASE_URL)");
}
