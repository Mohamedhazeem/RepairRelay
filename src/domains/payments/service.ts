/**
 * Payment orchestration service (S04 scope).
 * Every mutation: local PaymentOperation + idempotency key persisted BEFORE the
 * outbound call; provider result confirmed before any success state; timeouts
 * become UNKNOWN and require reconciliation. The browser never triggers capture.
 */

import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { createPayPalOrder, authorizeOrder, getOrder, type PayPalError } from "@/integrations/paypal/client";
import type { AuthorizationResult } from "@/integrations/paypal/client";

type Adapter = typeof createPayPalOrder;
type AuthorizeAdapter = typeof authorizeOrder;

export type PaymentErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "DEPENDENCY_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_OUTCOME_UNKNOWN";

export type PaymentOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; code: PaymentErrorCode; message: string; debugId?: string; retryAfterSeconds?: number };

function failure<T>(code: PaymentErrorCode, message: string, extra?: { debugId?: string; retryAfterSeconds?: number }): PaymentOutcome<T> {
  return { ok: false, code, message, ...extra };
}

function errorDetail(err: PayPalError): string | undefined {
  return err.kind === "BAD_REQUEST" || err.kind === "UNPROCESSABLE" ? err.detail : undefined;
}

function providerErrorMessage(err: PayPalError): { code: PaymentErrorCode; message: string } {
  switch (err.kind) {
    case "TIMEOUT":
    case "NETWORK":
    case "PROVIDER_ERROR":
      return { code: "PROVIDER_OUTCOME_UNKNOWN", message: "Payment provider did not respond clearly — reconciling before any retry" };
    case "AUTH":
      return { code: "DEPENDENCY_UNAVAILABLE", message: "Payment provider authentication failed — check server configuration" };
    case "BAD_REQUEST":
      return { code: "PROVIDER_REJECTED", message: "Payment request was rejected as invalid" };
    case "UNPROCESSABLE":
      return { code: "PROVIDER_REJECTED", message: "The provider could not process the payment action" };
    case "NOT_CONFIGURED":
      return { code: "DEPENDENCY_UNAVAILABLE", message: "Payments are not configured on the server" };
  }
}

async function startOperation(
  prisma: PrismaClient,
  attemptId: string,
  operationType: "CREATE_ORDER" | "AUTHORIZE" | "CAPTURE" | "VOID" | "RECONCILE",
  requestHash: string,
): Promise<{ idempotencyKey: string; reused: boolean }> {
  // Deterministic key per (attempt, operation, requestHash) makes retries reuse the key.
  const idempotencyKey = randomUUID();
  const existing = await prisma.paymentOperation.findFirst({
    where: { attempt: { id: attemptId }, operationType, status: "STARTED", startedAt: { gt: new Date(Date.now() - 5 * 60 * 1000) } },
  });
  if (existing) throw Object.assign(new Error("OPERATION_IN_PROGRESS"), { operationInProgress: true, idempotencyKey: existing.idempotencyKey });
  await prisma.paymentOperation.create({
    data: { paymentAttemptId: attemptId, operationType, idempotencyKey, status: "STARTED", requestHash },
  });
  return { idempotencyKey, reused: false };
}

export type OrderOutcome = { attemptId: string; paypalOrderId: string; status: string; amountMinor: number; currency: string };

export async function createOrderForContract(
  prisma: PrismaClient,
  contractId: string,
  customerId: string,
  input: { expectedContractVersion: number; appUrl: string },
  deps?: { adapter?: Adapter },
): Promise<PaymentOutcome<OrderOutcome>> {
  const contract = await prisma.repairContract.findUnique({
    where: { id: contractId },
    include: { repairRequest: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!contract || contract.repairRequest.customerId !== customerId) {
    return failure("NOT_FOUND", "Contract not found");
  }
  if (contract.status !== "APPROVED") {
    return failure("VALIDATION_ERROR", "The contract must be approved before payment");
  }
  if (contract.versions[0].id !== contract.currentVersionId) {
    return failure("CONFLICT", "The contract changed — refresh and review the latest version");
  }

  // One active payment per contract: block duplicates and unresolved attempts.
  const existing = await prisma.paymentAttempt.findFirst({
    where: { repairContractId: contractId },
    orderBy: { createdAt: "desc" },
    include: { operations: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  if (existing) {
    if (existing.status === "AUTHORIZED" || existing.status === "CAPTURED" || existing.status === "CAPTURE_PENDING") {
      return failure("CONFLICT", "An authorization already exists for this contract — void it before creating a new order");
    }
    if (existing.status === "ORDER_CREATED" || existing.status === "BUYER_APPROVAL_PENDING") {
      // Idempotent return of the same order for duplicate clicks.
      return { ok: true, result: { attemptId: existing.id, paypalOrderId: existing.paypalOrderId!, status: existing.status, amountMinor: existing.amountMinor, currency: existing.currency } };
    }
    if (existing.status === "ORDER_CREATE_PENDING" || existing.status.endsWith("UNKNOWN") || existing.status === "AUTHORIZATION_PENDING") {
      return failure("PROVIDER_OUTCOME_UNKNOWN", "A payment operation is unresolved — reconcile before creating a new order");
    }
  }

  const version = contract.versions[0];
  const requestHash = createHash("sha256").update(`${contractId}:${version.id}:${contract.totalMinor}:${contract.currency}`).digest("hex");
  const attempt = await prisma.paymentAttempt.create({
    data: {
      repairContractId: contractId,
      contractVersionId: version.id,
      currency: contract.currency,
      amountMinor: contract.totalMinor,
      status: "ORDER_CREATE_PENDING",
    },
  });

  let idempotencyKey: string;
  try {
    ({ idempotencyKey } = await startOperation(prisma, attempt.id, "CREATE_ORDER", requestHash));
  } catch (err) {
    if ((err as { operationInProgress?: boolean }).operationInProgress) {
      return failure("CONFLICT", "An order creation is already in progress");
    }
    throw err;
  }

  const adapter = deps?.adapter ?? createPayPalOrder;
  const result = await adapter({
    amountMinor: contract.totalMinor,
    currency: contract.currency,
    referenceId: contract.id,
    requestId: idempotencyKey,
    returnUrl: `${input.appUrl}/repairs/${contract.repairRequestId}/payment?return=1`,
    cancelUrl: `${input.appUrl}/repairs/${contract.repairRequestId}/payment?cancel=1`,
  });

  if (!result.ok) {
    const mapped = providerErrorMessage(result.error);
    await prisma.paymentOperation.updateMany({
      where: { idempotencyKey },
      data: {
        status: result.error.kind === "TIMEOUT" || result.error.kind === "NETWORK" || result.error.kind === "PROVIDER_ERROR" ? "UNKNOWN" : "FAILED",
        errorCode: result.error.kind,
        providerResponseRedacted: (errorDetail(result.error) ?? undefined) as Prisma.InputJsonValue | undefined,
        completedAt: new Date(),
      },
    });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: mapped.code === "PROVIDER_OUTCOME_UNKNOWN" ? "ORDER_CREATE_PENDING" : "NOT_CREATED" },
    });
    return failure(mapped.code as "PROVIDER_OUTCOME_UNKNOWN", mapped.message, { debugId: result.error.kind === "BAD_REQUEST" || result.error.kind === "UNPROCESSABLE" ? result.error.debugId : undefined });
  }

  await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "SUCCEEDED", completedAt: new Date() } });
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: "ORDER_CREATED", paypalOrderId: result.order.id, rawOrderStatus: result.order.status },
  });
  await writeAudit(prisma, {
    aggregateType: "PaymentAttempt",
    aggregateId: attempt.id,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "payment.order_created",
    payload: { paypalOrderId: result.order.id, amountMinor: contract.totalMinor },
  });
  return { ok: true, result: { attemptId: attempt.id, paypalOrderId: result.order.id, status: "ORDER_CREATED", amountMinor: contract.totalMinor, currency: contract.currency } };
}

export type AuthorizeOutcome = {
  attemptId: string;
  status: "AUTHORIZED" | "AUTHORIZATION_DECLINED" | "AUTHORIZATION_UNKNOWN";
  authorizationId?: string;
  expiresAt?: string | null;
  amountMinor: number;
  currency: string;
};

export async function authorizeApprovedOrder(
  prisma: PrismaClient,
  paypalOrderId: string,
  customerId: string,
  deps?: { adapter?: AuthorizeAdapter },
): Promise<PaymentOutcome<AuthorizeOutcome>> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { paypalOrderId },
    include: { contract: { include: { repairRequest: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } } } },
  });
  if (!attempt || attempt.contract.repairRequest.customerId !== customerId) {
    return failure("NOT_FOUND", "Payment order not found");
  }
  if (attempt.contractVersionId !== attempt.contract.currentVersionId) {
    return failure("CONFLICT", "The contract changed — this order no longer matches the current version");
  }
  if (attempt.status === "AUTHORIZED") {
    // Idempotent: duplicate onApprove callbacks return the persisted result.
    return {
      ok: true,
      result: {
        attemptId: attempt.id,
        status: "AUTHORIZED",
        authorizationId: attempt.paypalAuthorizationId ?? undefined,
        expiresAt: attempt.authorizationExpiresAt?.toISOString() ?? null,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
      },
    };
  }
  if (attempt.status !== "ORDER_CREATED" && attempt.status !== "BUYER_APPROVAL_PENDING") {
    // BUYER_APPROVAL_PENDING covers hosted-page approvals surfaced by reconciliation.
    return failure("CONFLICT", `Order is in state ${attempt.status} — it cannot be authorized now`);
  }

  const requestHash = createHash("sha256").update(`${attempt.id}:authorize`).digest("hex");
  let idempotencyKey: string;
  try {
    ({ idempotencyKey } = await startOperation(prisma, attempt.id, "AUTHORIZE", requestHash));
  } catch (err) {
    if ((err as { operationInProgress?: boolean }).operationInProgress) {
      return failure("CONFLICT", "An authorization is already in progress");
    }
    throw err;
  }

  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "AUTHORIZATION_PENDING" } });
  const adapter = deps?.adapter ?? authorizeOrder;
  const result = await adapter({ orderId: paypalOrderId, requestId: idempotencyKey });

  if (!result.ok) {
    const mapped = providerErrorMessage(result.error);
    const unknown = mapped.code === "PROVIDER_OUTCOME_UNKNOWN";
    await prisma.paymentOperation.updateMany({
      where: { idempotencyKey },
      data: {
        status: unknown ? "UNKNOWN" : "FAILED",
        errorCode: result.error.kind,
        providerResponseRedacted: (errorDetail(result.error) ?? undefined) as Prisma.InputJsonValue | undefined,
        completedAt: new Date(),
      },
    });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: unknown ? "AUTHORIZATION_UNKNOWN" : "AUTHORIZATION_DECLINED", rawOrderStatus: result.error.kind === "UNPROCESSABLE" ? "DECLINED" : undefined },
    });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "SYSTEM",
      eventType: "payment.authorization_failed",
      payload: { error: result.error.kind, issue: result.error.kind === "UNPROCESSABLE" ? result.error.issue : undefined },
    });
    return failure(mapped.code as "PROVIDER_REJECTED", result.error.kind === "UNPROCESSABLE" ? "The buyer approval was not completed or was declined" : mapped.message, { debugId: result.error.kind === "BAD_REQUEST" || result.error.kind === "UNPROCESSABLE" ? result.error.debugId : undefined });
  }

  const auth: AuthorizationResult = result.authorization;
  const version = attempt.contract.versions[0];
  // Exact amount/currency match against the immutable approved version.
  const expectedValue = (version.totalMinor / 100).toFixed(2);
  const amountOk =
    auth.amount !== null &&
    auth.amount.currencyCode === attempt.currency &&
    auth.amount.value === expectedValue;
  if (!amountOk || auth.amount === null) {
    await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "FAILED", errorCode: "AMOUNT_MISMATCH", completedAt: new Date() } });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "AUTHORIZATION_DECLINED", paypalAuthorizationId: auth.authorizationId, rawAuthorizationStatus: auth.status },
    });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "SYSTEM",
      eventType: "payment.authorization_amount_mismatch",
      payload: { expected: expectedValue, received: auth.amount?.value ?? null },
    });
    return failure("PROVIDER_REJECTED", "The authorized amount does not match the approved contract — payment blocked for review");
  }

  await prisma.paymentOperation.updateMany({ where: { idempotencyKey }, data: { status: "SUCCEEDED", completedAt: new Date() } });
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "AUTHORIZED",
      paypalAuthorizationId: auth.authorizationId,
      rawAuthorizationStatus: auth.status,
      rawOrderStatus: auth.orderStatus,
      authorizationExpiresAt: auth.expirationTime ? new Date(auth.expirationTime) : null,
    },
  });
  await prisma.repairRequest.update({ where: { id: attempt.contract.repairRequestId }, data: { status: "CONTRACT_APPROVED" } });
  await writeAudit(prisma, {
    aggregateType: "PaymentAttempt",
    aggregateId: attempt.id,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "payment.authorized",
    payload: { authorizationId: auth.authorizationId, amountMinor: version.totalMinor, expiresAt: auth.expirationTime ?? null },
  });
  return {
    ok: true,
    result: {
      attemptId: attempt.id,
      status: "AUTHORIZED",
      authorizationId: auth.authorizationId,
      expiresAt: auth.expirationTime,
      amountMinor: version.totalMinor,
      currency: attempt.currency,
    },
  };
}

export async function markBuyerCancelled(
  prisma: PrismaClient,
  paypalOrderId: string,
  customerId: string,
): Promise<PaymentOutcome<{ attemptId: string; status: "BUYER_CANCELLED" }>> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { paypalOrderId },
    include: { contract: { include: { repairRequest: true } } },
  });
  if (!attempt || attempt.contract.repairRequest.customerId !== customerId) {
    return failure("NOT_FOUND", "Payment order not found");
  }
  if (attempt.status === "AUTHORIZED" || attempt.status === "CAPTURED") {
    return failure("CONFLICT", "Payment already authorized — cancellation requires the void workflow");
  }
  if (attempt.status === "ORDER_CREATED" || attempt.status === "BUYER_APPROVAL_PENDING") {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "BUYER_CANCELLED" } });
    await writeAudit(prisma, {
      aggregateType: "PaymentAttempt",
      aggregateId: attempt.id,
      actorType: "CUSTOMER",
      actorId: customerId,
      eventType: "payment.buyer_cancelled",
    });
  }
  return { ok: true, result: { attemptId: attempt.id, status: "BUYER_CANCELLED" } };
}

/** Reconciliation: provider reads only; updates raw + normalized statuses. */
export async function reconcileAttempt(
  prisma: PrismaClient,
  attemptId: string,
  deps?: { orderAdapter?: typeof getOrder },
): Promise<PaymentOutcome<{ attemptId: string; status: string; rawOrderStatus: string | null }>> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId }, include: { contract: { include: { repairRequest: true } } } });
  if (!attempt) return failure("NOT_FOUND", "Payment attempt not found");
  if (!attempt.paypalOrderId) return failure("VALIDATION_ERROR", "No order was created for this attempt");

  const adapter = deps?.orderAdapter ?? getOrder;
  const result = await adapter(attempt.paypalOrderId);
  if (!result.ok) {
    const mapped = providerErrorMessage(result.error);
    return failure(mapped.code as "PROVIDER_OUTCOME_UNKNOWN", "Reconciliation could not read the provider state — try again");
  }
  const order = result.order as {
    status?: string;
    purchase_units?: Array<{ payments?: { authorizations?: Array<{ id: string; status: string; amount?: { value: string } }> } }>;
  };
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  let status = attempt.status;
  if (order.status === "APPROVED") status = "BUYER_APPROVAL_PENDING";
  if (order.status === "COMPLETED" && auth) {
    status =
      auth.status === "CAPTURED" ? "CAPTURED"
      : auth.status === "VOIDED" ? "VOIDED"
      : auth.status === "DENIED" ? "AUTHORIZATION_DECLINED"
      : auth.status === "PENDING" ? "CAPTURE_PENDING"
      : auth.status === "CREATED" ? "AUTHORIZED"
      : "AUTHORIZATION_UNKNOWN";
  }
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      rawOrderStatus: order.status ?? null,
      rawAuthorizationStatus: auth?.status ?? attempt.rawAuthorizationStatus,
      paypalAuthorizationId: auth?.id ?? attempt.paypalAuthorizationId,
    },
  });
  await writeAudit(prisma, {
    aggregateType: "PaymentAttempt",
    aggregateId: attempt.id,
    actorType: "DEMO_ADMIN",
    eventType: "payment.reconciled",
    payload: { providerOrderStatus: order.status ?? null, authorizationStatus: auth?.status ?? null, resolvedStatus: status },
  });
  return { ok: true, result: { attemptId: attempt.id, status, rawOrderStatus: order.status ?? null } };
}

export async function getPaymentView(prisma: PrismaClient, repairId: string, customerId: string) {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { contract: { include: { paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  if (!repair || repair.customerId !== customerId) return null;
  const attempt = repair.contract?.paymentAttempts[0];
  return {
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          amountMinor: attempt.amountMinor,
          currency: attempt.currency,
          paypalOrderId: attempt.paypalOrderId,
          authorizationExpiresAt: attempt.authorizationExpiresAt?.toISOString() ?? null,
        }
      : null,
    contract: repair.contract ? { id: repair.contract.id, status: repair.contract.status, version: repair.contract.version, totalMinor: repair.contract.totalMinor, currency: repair.contract.currency } : null,
  };
}

void getServerEnv;
