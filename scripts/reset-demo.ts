/**
 * Demo reset (S07 scope): CLI entry for the same reset the demo operator can
 * trigger from the admin UI. Wipes transactions and private assets, re-seeds
 * demo accounts. NEVER fabricates provider results — the next demo run
 * performs fresh, real Channel3/PayPal calls.
 *
 * Usage: npm run db:demo-reset
 */

import { PrismaClient } from "@prisma/client";
import { resetDemoData } from "../src/domains/admin/demoReset";

const prisma = new PrismaClient();

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Demo reset failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });

async function main() {
  const seedPassword = process.env.DEMO_SEED_PASSWORD;
  if (!seedPassword) {
    console.error("DEMO_SEED_PASSWORD is required (set it in .env.local)");
    process.exit(1);
  }
  console.log("Resetting demo data…");
  await resetDemoData(prisma, seedPassword);
  console.log("Demo reset complete: transactions wiped, uploaded assets removed, demo accounts re-seeded.");
  console.log("The next demo run performs fresh, real Channel3 / AI / PayPal sandbox calls.");
}
