import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * E2E-01 (customer happy path, part 1): sign-in → intake → upload → real AI
 * diagnosis → live Channel3 search → select device reference → quotes →
 * select quote → contract → approve → PayPal buttons render (Sandbox).
 * The buyer popup approval is covered by the manual sandbox rehearsal
 * (docs/VERIFICATION-LOG.md) — Playwright never fakes provider results.
 *
 * Role-guard checks are included (customer vs repairer areas).
 */

const CUSTOMER_EMAIL = "customer@demo.repairrelay.test";
const REPAIRER_EMAIL = "repairer.ava@demo.repairrelay.test";

function seedPassword(): string {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("DEMO_SEED_PASSWORD="));
  return line!.split("=").slice(1).join("=");
}

test("customer journey through contract approval with real providers", async ({ page }) => {
  // Sign in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(CUSTOMER_EMAIL);
  await page.getByLabel("Password").fill(seedPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/repairs");

  // Demo environment disclosure visible.
  await expect(page.getByText("DEMO ENVIRONMENT")).toBeVisible();

  // Intake.
  await page.goto("/repairs/new");
  await page.getByLabel("Symptoms").fill("The front glass is cracked after a drop. Touch currently responds.");
  await page.getByLabel("Repair category").selectOption("DISPLAY_REPLACEMENT");
  await page.setInputFiles('input[type="file"]', "tests/fixtures/ai/sample-device.png");
  await page.getByRole("button", { name: "Create repair request" }).click();
  await page.waitForURL(/\/repairs\/[0-9a-f-]{36}/);
  await expect(page.getByText(/reference RR-/i)).toBeVisible();

  // Real AI diagnosis (may honestly return UNASSESSED for the synthetic image).
  await page.getByRole("button", { name: "Run AI assessment" }).click();
  await expect(page.getByText(/AI-assisted assessment|AI assessment unavailable/i)).toBeVisible({ timeout: 90_000 });

  // Live Channel3 replacement-device search.
  await page.goto(`/repairs/${repairIdFrom(page.url())}/products`);
  await page.getByRole("button", { name: "Find replacement devices" }).click();
  await expect(page.getByText(/Candidate listings/)).toBeVisible({ timeout: 60_000 });
  const useReference = page.getByRole("button", { name: /Use as replace-price reference/ }).first();
  await expect(useReference).toBeVisible({ timeout: 30_000 });
  await useReference.click();
  await expect(page.getByText("Comparison reference saved")).toBeVisible();

  // Quotes.
  await page.goto(`/repairs/${repairIdFrom(page.url())}/quotes`);
  await page.getByRole("button", { name: "Request quotes from simulated repairers" }).click();
  await expect(page.getByText("SIMULATED REPAIRER").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Lowest total")).toBeVisible();
  await page.getByRole("button", { name: "Select this quote" }).first().click();
  await expect(page.getByText("Quote selected")).toBeVisible();

  // Contract review + approval.
  await page.goto(`/repairs/${repairIdFrom(page.url())}/contract`);
  await expect(page.getByText("PAYPAL SANDBOX").first()).toBeVisible();
  await expect(page.getByText("This is not escrow")).toBeVisible();
  await page.getByRole("button", { name: /Approve repair terms/ }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("link", { name: /Continue to PayPal authorization/ })).toBeVisible();

  // Payment page renders the official PayPal Buttons (Sandbox); buyer approval is manual.
  await page.getByRole("link", { name: /Continue to PayPal authorization/ }).click();
  await page.waitForURL("**/payment");
  await expect(page.getByText("PayPal will")).toBeVisible();
  const buttonsFrame = page.frameLocator('iframe[name*="paypal_buttons"]').first();
  await expect(buttonsFrame.getByText(/PayPal|Debit or Credit Card/).first()).toBeVisible({ timeout: 30_000 });
});

test("role guards: customer cannot open repairer area; unauthenticated is redirected", async ({ page }) => {
  await page.goto("/repairer");
  await expect(page).toHaveURL(/\/login\?next=%2Frepairer/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(CUSTOMER_EMAIL);
  await page.getByLabel("Password").fill(seedPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/repairs");

  await page.goto("/repairer");
  await expect(page).toHaveURL(/\/repairs/); // redirected home, no leak

  // Sign out, then repairer can access the workbench.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(REPAIRER_EMAIL);
  await page.getByLabel("Password").fill(seedPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/repairer");
  await expect(page.getByText("SIMULATED REPAIRER").first()).toBeVisible();
});

function repairIdFrom(url: string): string {
  const m = url.match(/\/repairs\/([0-9a-f-]{36})/);
  if (!m) throw new Error(`No repair id in URL: ${url}`);
  return m[1];
}
