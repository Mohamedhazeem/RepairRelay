/**
 * Payment orchestration (S04 scope): the ONLY paths that move money state.
 * Capture runs exclusively from a recorded customer ACCEPT decision; void runs
 * exclusively from cancellation or an approved amount-change workflow. Every
 * operation persists its idempotency key before the outbound call; unknown
 * outcomes stay UNKNOWN until reconciled. AI and evidence code can never reach
 * this module.
 */

import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { captureAuthorization, voidAuthorization } from "@/integrations/paypal/client";

export type OrchestrationOutcome =
  | { ok: true; status: string; captureId?: string; message?: string }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "PROVIDER_OUTCOME_UNKNOWN" | "PROVIDER_REJECTED"; message: string };

/** Capture the authorization after an explicit ACCEPT decision. */
export async function captureAfterAcceptance(
  prisma: PrismaClient,
  contractId: string,
  customerId: string,
  opts?: { traceId?: string },
): Promise<OrchestrationOutcome> {
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { repairContractId: contractId },
    orderBy: { createdAt: "desc" },
    include: { contract: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } } },
  });
  if (!attempt) return { ok: false, code: "NOT_FOUND", message: "No payment attempt exists for this contract" };
  if (attempt.status === "CAPTURED") return { ok: true, status: "CAPTURED", captureId: attempt.paypalCaptureId ?? undefined };
  if (attempt.status !== "AUTHORIZED" || !attempt.paypalAuthorizationId) {
    return { ok: false, code: "CONFLICT", message: `Payment is ${attempt.status} — capture is not possible` };
  }
  // Contract version guard: the accepted decision referenced the current version (enforced by the decision service).
  if (attempt.contractVersionId !== attempt.contract.currentVersionId) {
    return { ok: false, code: "CONFLICT", message: "The payment no longer matches the current contract version" };
  }

  const requestHash = createHash("sha256").update(`${attempt.id}:capture`).digest("hex");
  const idempotencyKey = randomUUID();
  const prior = await prisma.paymentOperation.findFirst({
    where: { paymentAttemptId: attempt.id, operationType: "CAPTURE", status: { in: ["STARTED", "SUCCEEDED", "UNKNOWN"] } },
  });
  if (prior) {
    return prior.status === "SUCCEEDED"
      ? { ok: true, status: "CAPTURED", captureId: attempt.paypalCaptureId ?? undefined }
      : { ok: false, code: "PROVIDER_OUTCOME_UNKNOWN", message: "A capture is already in progress or unresolved — reconcile before retrying" };
  }
  await prisma.paymentOperation.create({
    data: { paymentAttemptId: attempt.id, operationType: "CAPTURE", idempotencyKey, status: "STARTED", requestHash },
  });
  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "CAPTURE_PENDING" } });

  const result = await captureAuthorization({ authorizationId: attempt.paypalAuthorizationId, requestId: idempotencyKey });
  if (!result.ok) {
    const unknown = result.error.kind === "TIMEOUT" || result.error.kind === "NETWORK" || result.error.kind === "PROVIDER_ERROR";
    await prisma.paymentOperation.updateMany({
      where: { idempotencyKey },
      data: { status: unknown ? "UNKNOWN" : "FAILED", errorCode: result.error.kind, completedAt: new Date() },
    });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: unknown ? "CAPTURE_UNKNOWN" : "CAPTURE_FAILED" },
    });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "SYSTEM",
      eventType: "payment.capture_failed",
      payload: { error: result.error.kind, unknown },
      traceId: opts?.traceId,
    });
    return unknown
      ? { ok: false, code: "PROVIDER_OUTCOME_UNKNOWN", message: "Capture outcome is unknown — reconciling with the provider before any retry" }
      : { ok: false, code: "PROVIDER_REJECTED", message: "The provider declined the capture" };
  }

  const capture = result.capture;
  if (capture.status !== "COMPLETED") {
    // PENDING or other: never mark paid; reconciliation continues.
    await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "UNKNOWN", completedAt: new Date() } });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "CAPTURE_PENDING", paypalCaptureId: capture.captureId, rawCaptureStatus: capture.status },
    });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "SYSTEM",
      eventType: "payment.capture_pending",
      payload: { captureId: capture.captureId, rawStatus: capture.status },
      traceId: opts?.traceId,
    });
    return { ok: true, status: "CAPTURE_PENDING", captureId: capture.captureId, message: "Capture is pending — confirming payment status" };
  }

  await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "SUCCEEDED", completedAt: new Date() } });
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: "CAPTURED", paypalCaptureId: capture.captureId, rawCaptureStatus: capture.status },
  });
  await prisma.repairRequest.update({ where: { id: attempt.contract.repairRequestId }, data: { status: "COMPLETED" } });
  await writeAudit(prisma, {
    aggregateType: "PaymentAttempt",
    aggregateId: attempt.id,
    actorType: "SYSTEM",
    eventType: "payment.captured",
    payload: { captureId: capture.captureId, amountMinor: attempt.amountMinor },
    traceId: opts?.traceId,
  });
  return { ok: true, status: "CAPTURED", captureId: capture.captureId };
}

/** Void the uncaptured authorization after an explicit CANCEL decision. */
export async function voidAfterCancellation(
  prisma: PrismaClient,
  contractId: string,
  customerId: string,
  opts?: { traceId?: string },
): Promise<OrchestrationOutcome> {
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { repairContractId: contractId },
    orderBy: { createdAt: "desc" },
    include: { contract: { include: { repairRequest: true } } },
  });
  if (!attempt) return { ok: false, code: "NOT_FOUND", message: "No payment attempt exists for this contract" };
  if (attempt.status === "CAPTURED" || attempt.status === "CAPTURE_PENDING") {
    return { ok: false, code: "CONFLICT", message: "The payment was captured — void is not possible" };
  }
  if (attempt.status === "VOIDED") return { ok: true, status: "VOIDED" };
  if (attempt.status !== "AUTHORIZED" || !attempt.paypalAuthorizationId) {
    return { ok: false, code: "CONFLICT", message: `Payment is ${attempt.status} — void is not possible` };
  }

  const idempotencyKey = randomUUID();
  const prior = await prisma.paymentOperation.findFirst({
    where: { paymentAttemptId: attempt.id, operationType: "VOID", status: { in: ["STARTED", "SUCCEEDED", "UNKNOWN"] } },
  });
  if (prior) {
    return prior.status === "SUCCEEDED"
      ? { ok: true, status: "VOIDED" }
      : { ok: false, code: "PROVIDER_OUTCOME_UNKNOWN", message: "A void is already in progress or unresolved — reconcile before retrying" };
  }
  await prisma.paymentOperation.create({
    data: { paymentAttemptId: attempt.id, operationType: "VOID", idempotencyKey, status: "STARTED" },
  });
  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "VOID_PENDING" } });

  const result = await voidAuthorization({ authorizationId: attempt.paypalAuthorizationId, requestId: idempotencyKey });
  if (!result.ok) {
    const unknown = result.error.kind === "TIMEOUT" || result.error.kind === "NETWORK" || result.error.kind === "PROVIDER_ERROR";
    await prisma.paymentOperation.updateMany({
      where: { idempotencyKey },
      data: { status: unknown ? "UNKNOWN" : "FAILED", errorCode: result.error.kind, completedAt: new Date() },
    });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: unknown ? "VOID_UNKNOWN" : "VOID_FAILED" },
    });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "SYSTEM",
      eventType: "payment.void_failed",
      payload: { error: result.error.kind, unknown },
      traceId: opts?.traceId,
    });
    return unknown
      ? { ok: false, code: "PROVIDER_OUTCOME_UNKNOWN", message: "Void outcome is unknown — reconciling with the provider before any retry" }
      : { ok: false, code: "PROVIDER_REJECTED", message: "The provider rejected the void" };
  }

  await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "SUCCEEDED", completedAt: new Date() } });
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: "VOIDED", rawAuthorizationStatus: "VOIDED" },
  });
  // Confirmed void → final cancelled state (void is never treated as a refund).
  await prisma.repairJob.updateMany({ where: { repairRequestId: attempt.contract.repairRequestId, status: "CANCEL_REQUESTED" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await prisma.repairRequest.update({ where: { id: attempt.contract.repairRequestId }, data: { status: "CANCELLED" } });
  await prisma.repairContract.updateMany({ where: { id: contractId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await writeAudit(prisma, {
    aggregateType: "PaymentAttempt",
    aggregateId: attempt.id,
    actorType: "SYSTEM",
    eventType: "payment.voided",
    payload: { authorizationId: attempt.paypalAuthorizationId },
    traceId: opts?.traceId,
  });
  return { ok: true, status: "VOIDED" };
}

void Prisma;
