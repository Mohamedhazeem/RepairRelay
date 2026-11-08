/**
 * Test helper: scoped audit-event cleanup. Tests in this repo share the local
 * dev database, so cleanup must NEVER delete audit events by type — only by
 * the exact aggregate ids a test created (real demo data lives in the same
 * table and must survive test runs).
 */

import { PrismaClient } from "@prisma/client";

export async function deleteAuditEventsFor(prisma: PrismaClient, aggregateIds: string[]): Promise<void> {
  if (aggregateIds.length === 0) return;
  await prisma.auditEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
}

/** Collects the derived aggregate ids (contract, job, attempt, submissions) for the given repairs. */
export async function collectAggregateIds(prisma: PrismaClient, repairIds: string[]): Promise<string[]> {
  const ids = new Set<string>(repairIds);
  for (const repairId of repairIds) {
    const repair = await prisma.repairRequest.findUnique({
      where: { id: repairId },
      include: { contract: { include: { paymentAttempts: true } }, jobs: { include: { submissions: true } } },
    });
    if (!repair) continue;
    if (repair.contract) {
      ids.add(repair.contract.id);
      for (const attempt of repair.contract.paymentAttempts) ids.add(attempt.id);
    }
    for (const job of repair.jobs) {
      ids.add(job.id);
      for (const s of job.submissions) ids.add(s.id);
    }
  }
  return Array.from(ids);
}

export type AuditCleanup = ReturnType<typeof makeAuditCleanup>;

export function makeAuditCleanup(prisma: PrismaClient) {
  const repairIds = new Set<string>();
  return {
    track(repairId: string) {
      repairIds.add(repairId);
    },
    async cleanup() {
      const ids = await collectAggregateIds(prisma, Array.from(repairIds));
      await deleteAuditEventsFor(prisma, ids);
    },
  };
}

