import { defineConfig } from "@playwright/test";

/**
 * E2E config (S07 scope). The webServer reuses the production build when present
 * (faster, realistic); otherwise fall back to dev. Tests exercise real app flows
 * against real local Postgres + real AI/Channel3 — the PayPal popup step is left
 * to the manual sandbox rehearsal (documented in docs/VERIFICATION-LOG.md).
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "node --env-file=.env.local ./node_modules/.bin/next start -p 3101",
    port: 3101,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
