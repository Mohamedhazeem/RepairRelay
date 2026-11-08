/**
 * Demo reset (S07-owned logic, admin surface). Wipes demo transaction rows
 * and private assets, then re-seeds demo accounts. NEVER fabricates provider
 * results — the next demo run performs fresh, real provider calls.
 */

import { PrismaClient } from "@prisma/client";
import { rm } from "node:fs/promises";
import { seedDemoUsers } from "../../../prisma/seed";

export async function resetDemoData(prisma: PrismaClient, seedPassword: string): Promise<void> {
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
  await rm("data/uploads", { recursive: true, force: true });
  await seedDemoUsers(prisma, seedPassword);
}
