/**
 * Append-only audit writer (application convention). Payloads must be allowlisted
 * — no secrets, card data, raw images or full sensitive PII.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { newTraceId } from "@/lib/http/errors";

export type AuditInput = {
  aggregateType: string;
  aggregateId: string;
  actorType: "CUSTOMER" | "SIMULATED_REPAIRER" | "DEMO_ADMIN" | "SYSTEM";
  actorId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
  traceId?: string;
};

export async function writeAudit(prisma: PrismaClient | Prisma.TransactionClient, input: AuditInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      payloadAllowlistedJson: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      traceId: input.traceId ?? newTraceId(),
    },
  });
}
