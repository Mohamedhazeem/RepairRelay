/**
 * Demo reset (S07 scope): wipes demo transaction rows and private assets, then
 * re-seeds the demo accounts. NEVER fabricates provider results — the next demo
 * run performs fresh, real Channel3/PayPal calls. Audit events are wiped with
 * the transactions they describe (documented demo reset, not a production flow).
 *
 * Usage: npm run db:demo-reset
 */

import { PrismaClient } from "@prisma/client";
import { rm } from "node:fs/promises";
import { seedDemoUsers } from "../prisma/seed";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting demo data…");
  // Order respects FKs: leaves → jobs/contracts → payment → core.
  await prisma.customerDecision.deleteMany({});
  await prisma.evidenceAssessment.deleteMany({});
  await prisma.evidenceAsset.deleteMany({});
  await prisma.evidenceSubmission.deleteMany({});
  await prisma.repairJob.deleteMany({});
  await prisma.paymentOperation.deleteMany({});
  await prisma.paymentAttempt.deleteMany({});
  await prisma.contractChangeRequest.deleteMany({});
  await prisma.contractVersion.deleteMany({});
  await prisma.repairContract.deleteMany({});
  await prisma.offerObservation.deleteMany({});
  await prisma.productCandidate.deleteMany({});
  await prisma.productSearchRun.deleteMany({});
  await prisma.repairQuote.deleteMany({});
  await prisma.diagnosisReport.deleteMany({});
  await prisma.uploadedAsset.deleteMany({});
  await prisma.auditEvent.deleteMany({});
  await prisma.repairRequest.deleteMany({});

  // Private uploaded assets on disk (local driver).
  await rm("data/uploads", { recursive: true, force: true });

  const seedPassword = process.env.DEMO_SEED_PASSWORD;
  if (!seedPassword) {
    console.error("DEMO_SEED_PASSWORD is required (set it in .env.local)");
    process.exit(1);
  }
  await seedDemoUsers(prisma, seedPassword);
  console.log("Demo reset complete: transactions wiped, uploaded assets removed, demo accounts re-seeded.");
  console.log("The next demo run performs fresh, real Channel3 / AI / PayPal sandbox calls.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Demo reset failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
