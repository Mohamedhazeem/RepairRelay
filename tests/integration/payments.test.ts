/**
 * S6 integration tests: order creation guards, idempotent duplicate handling,
 * authorization confirmation with exact amount match, buyer cancel, unknown
 * outcomes, amount mismatch and concurrency — provider adapter injected.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { collectAggregateIds, deleteAuditEventsFor } from "../helpers/auditCleanup";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";
import { createContractFromSelection, approveContract } from "../../src/domains/contracts/service";
import { createOrderForContract, authorizeApprovedOrder, markBuyerCancelled, reconcileAttempt } from "../../src/domains/payments/service";

const prisma = new PrismaClient();
let customerId: string;
let otherCustomerId: string;
let repairerUserId: string;
let repairId: string;
let contractId: string;
let contractVersion: number;
let totalMinor: number;

const orderAdapterOk = (async (input: { amountMinor: number; currency: string }) => ({
  ok: true as const,
  order: { id: `ORDER-${input.amountMinor}`, status: "CREATED" },
})) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;

function authorizeAdapter(overrides?: Partial<{ amountValue: string; currency: string; status: string }>) {
  return (async () => ({
    ok: true as const,
    authorization: {
      authorizationId: `AUTH-${Date.now()}`,
      status: overrides?.status ?? "CREATED",
      amount: { currencyCode: overrides?.currency ?? "USD", value: overrides?.amountValue ?? (totalMinor / 100).toFixed(2) },
      expirationTime: "2026-12-07T00:00:00Z",
      orderStatus: "COMPLETED",
    },
  })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
}

async function setupApprovedContract() {
  const outcome = await createContractFromSelection(prisma, repairId, customerId);
  if (!outcome.ok) throw new Error("contract creation failed");
  contractId = outcome.contractId;
  const approved = await approveContract(prisma, contractId, customerId, { expectedContractVersion: outcome.version, confirmed: true });
  if (!approved.ok) throw new Error("approval failed");
  contractVersion = approved.version;
}

beforeAll(async () => {
  const customer = await prisma.user.create({
    data: { email: `s6-cust-${Date.now()}@test.local`, displayName: "S6 Customer", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = customer.id;
  const other = await prisma.user.create({
    data: { email: `s6-other-${Date.now()}@test.local`, displayName: "S6 Other", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  otherCustomerId = other.id;
  const repairer = await prisma.user.create({
    data: { email: `s6-rep-${Date.now()}@test.local`, displayName: "S6 Repairer (Simulated)", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
  });
  repairerUserId = repairer.id;
  const profile = await prisma.simulatedRepairer.create({
    data: { userId: repairerUserId, displayName: "S6 Repairer (Simulated)", demoDescription: "Simulated." },
  });
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S6-${Date.now().toString(16).toUpperCase()}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "Cracked glass for the payment slice test.",
      repairCategory: "DISPLAY_REPLACEMENT",
      status: "QUOTES_AVAILABLE",
    },
  });
  repairId = repair.id;
  const computed = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[0]);
  totalMinor = computed.totalMinor;
  const quote = await prisma.repairQuote.create({
    data: {
      repairRequestId: repairId,
      repairerId: profile.id,
      status: "SELECTED",
      componentLabel: computed.componentLabel,
      compatibilityAttestation: "CONFIRMED_FOR_DEMO",
      compatibilityNotes: "Simulated.",
      partChargeMinor: computed.partChargeMinor,
      labourMinor: computed.labourMinor,
      totalMinor: computed.totalMinor,
      currency: "USD",
      warrantyDays: computed.warrantyDays,
      warrantyText: computed.warrantyText,
      estimatedDurationHours: computed.estimatedDurationHours,
      scopeText: computed.scopeText,
      exclusionsText: computed.exclusionsText,
      validUntil: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { selectedQuoteId: quote.id } });
  await setupApprovedContract();
});

afterAll(async () => {
  await deleteAuditEventsFor(prisma, await collectAggregateIds(prisma, [repairId]));
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { contract: true } });
  if (repair?.contract) {
    await prisma.paymentOperation.deleteMany({ where: { attempt: { repairContractId: repair.contract.id } } });
    await prisma.paymentAttempt.deleteMany({ where: { repairContractId: repair.contract.id } });
    await prisma.contractChangeRequest.deleteMany({ where: { contractId: repair.contract.id } });
    await prisma.contractVersion.deleteMany({ where: { contractId: repair.contract.id } });
    await prisma.repairContract.delete({ where: { id: repair.contract.id } });
  }
  await prisma.repairQuote.deleteMany({ where: { repairRequestId: repairId } });
  await prisma.repairRequest.delete({ where: { id: repairId } }).catch(() => undefined);
  await prisma.simulatedRepairer.deleteMany({ where: { userId: repairerUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, repairerUserId] } } });
  await prisma.$disconnect();
});

describe("order creation", () => {
  it("creates one purchase unit matching the approved contract", async () => {
    const outcome = await createOrderForContract(prisma, contractId, customerId, { expectedContractVersion: contractVersion, appUrl: "http://localhost:3000" }, { adapter: orderAdapterOk });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.amountMinor).toBe(totalMinor);
    expect(outcome.result.currency).toBe("USD");
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: outcome.result.attemptId } });
    expect(attempt!.status).toBe("ORDER_CREATED");
    expect(attempt!.paypalOrderId).toBe(`ORDER-${totalMinor}`);
    const operations = await prisma.paymentOperation.findMany({ where: { attempt: { id: attempt!.id } } });
    expect(operations[0].status).toBe("SUCCEEDED");
  });

  it("returns the same order for duplicate clicks (idempotent)", async () => {
    const second = await createOrderForContract(prisma, contractId, customerId, { expectedContractVersion: contractVersion, appUrl: "http://localhost:3000" }, { adapter: orderAdapterOk });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.paypalOrderId).toBe(`ORDER-${totalMinor}`);
    const attempts = await prisma.paymentAttempt.count({ where: { repairContractId: contractId } });
    expect(attempts).toBe(1);
  });

  it("blocks a different customer's order on the same contract", async () => {
    const foreign = await createOrderForContract(prisma, contractId, otherCustomerId, { expectedContractVersion: contractVersion, appUrl: "http://localhost:3000" }, { adapter: orderAdapterOk });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("NOT_FOUND");
  });

  it("blocks new orders while an unresolved/authorized attempt exists", async () => {
    // Simulate an authorized attempt by direct state (the happy-path authorize test below covers the real flow).
    const attempt = await prisma.paymentAttempt.findFirst({ where: { repairContractId: contractId } });
    expect(attempt).not.toBeNull();
    await prisma.paymentAttempt.update({ where: { id: attempt!.id }, data: { status: "AUTHORIZED", paypalAuthorizationId: "PRE-AUTH", paypalOrderId: attempt!.paypalOrderId } });
    const blocked = await createOrderForContract(prisma, contractId, customerId, { expectedContractVersion: contractVersion, appUrl: "http://localhost:3000" }, { adapter: orderAdapterOk });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("CONFLICT");
    await prisma.paymentAttempt.update({ where: { id: attempt!.id }, data: { status: "ORDER_CREATED", paypalAuthorizationId: null } });
  });

  it("maps provider timeout to an unresolved state with retry guidance", async () => {
    const temp = await prisma.repairRequest.create({
      data: {
        publicReference: `RR-S6T-${Date.now().toString(16).toUpperCase()}`,
        customerId,
        deviceBrand: "Apple",
        deviceModel: "iPhone 13",
        deviceModelConfidence: "USER_SELECTED",
        symptoms: "Timeout path fixture for the payment service.",
        repairCategory: "DISPLAY_REPLACEMENT",
        status: "QUOTES_AVAILABLE",
      },
    });
    const computed = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[2]);
    const quote = await prisma.repairQuote.create({
      data: {
        repairRequestId: temp.id,
        repairerId: (await prisma.simulatedRepairer.findUniqueOrThrow({ where: { userId: repairerUserId } })).id,
        status: "SELECTED",
        componentLabel: computed.componentLabel,
        compatibilityAttestation: "CONFIRMED_FOR_DEMO",
        compatibilityNotes: "Simulated.",
        partChargeMinor: computed.partChargeMinor,
        labourMinor: computed.labourMinor,
        totalMinor: computed.totalMinor,
        currency: "USD",
        warrantyDays: 365,
        warrantyText: "w",
        estimatedDurationHours: 6,
        scopeText: computed.scopeText,
        exclusionsText: computed.exclusionsText,
        validUntil: new Date(Date.now() + 3600 * 1000),
      },
    });
    await prisma.repairRequest.update({ where: { id: temp.id }, data: { selectedQuoteId: quote.id } });
    const created = await createContractFromSelection(prisma, temp.id, customerId);
    if (!created.ok) throw new Error("temp contract failed");
    await approveContract(prisma, created.contractId, customerId, { expectedContractVersion: created.version, confirmed: true });

    const timeoutAdapter = (async () => ({ ok: false as const, error: { kind: "TIMEOUT" as const } })) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;
    const outcome = await createOrderForContract(prisma, created.contractId, customerId, { expectedContractVersion: created.version + 1, appUrl: "http://x" }, { adapter: timeoutAdapter });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PROVIDER_OUTCOME_UNKNOWN");

    await prisma.paymentOperation.deleteMany({ where: { attempt: { repairContractId: created.contractId } } });
    await prisma.paymentAttempt.deleteMany({ where: { repairContractId: created.contractId } });
    await prisma.contractVersion.deleteMany({ where: { contractId: created.contractId } });
    await prisma.repairContract.delete({ where: { id: created.contractId } });
    await prisma.repairQuote.deleteMany({ where: { repairRequestId: temp.id } });
    await prisma.repairRequest.delete({ where: { id: temp.id } });
  });
});

describe("authorization", () => {
  it("authorizes after buyer approval and requires exact amount match", async () => {
    // Reset the attempt state from earlier guards, then authorize for real.
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contractId } });
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "ORDER_CREATED" } });
    const outcome = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, customerId, { adapter: authorizeAdapter() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).toBe("AUTHORIZED");
    const updated = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(updated.status).toBe("AUTHORIZED");
    expect(updated.rawAuthorizationStatus).toBe("CREATED");
    expect(updated.authorizationExpiresAt).not.toBeNull();
  });

  it("is idempotent for duplicate onApprove callbacks", async () => {
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contractId } });
    const again = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, customerId, { adapter: authorizeAdapter() });
    expect(again.ok).toBe(true);
    const authCount = await prisma.paymentOperation.count({ where: { attempt: { id: attempt.id }, operationType: "AUTHORIZE", status: "SUCCEEDED" } });
    expect(authCount).toBe(1);
  });

  it("refuses wrong customers and mismatches amounts", async () => {
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contractId } });
    const foreign = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, otherCustomerId, { adapter: authorizeAdapter() });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("NOT_FOUND");

    // Force an amount mismatch on a fresh attempt-like order id.
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "ORDER_CREATED" } });
    const mismatch = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, customerId, { adapter: authorizeAdapter({ amountValue: "999.99" }) });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.message).toContain("does not match");
    const updated = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(updated.status).toBe("AUTHORIZATION_DECLINED");
    const op = await prisma.paymentOperation.findFirstOrThrow({ where: { attempt: { id: attempt.id }, errorCode: "AMOUNT_MISMATCH" } });
    expect(op.errorCode).toBe("AMOUNT_MISMATCH");
  });

  it("maps provider decline (422) to AUTHORIZATION_DECLINED and timeouts to UNKNOWN", async () => {
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contractId } });
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "ORDER_CREATED" } });
    const declineAdapter = (async () => ({ ok: false as const, error: { kind: "UNPROCESSABLE" as const, detail: "buyer declined", issue: "INSTRUMENT_DECLINED" } })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
    const declined = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, customerId, { adapter: declineAdapter });
    expect(declined.ok).toBe(false);
    let state = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(state.status).toBe("AUTHORIZATION_DECLINED");

    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "ORDER_CREATED" } });
    const timeoutAdapter = (async () => ({ ok: false as const, error: { kind: "TIMEOUT" as const } })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
    const unknown = await authorizeApprovedOrder(prisma, attempt.paypalOrderId!, customerId, { adapter: timeoutAdapter });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("PROVIDER_OUTCOME_UNKNOWN");
    state = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(state.status).toBe("AUTHORIZATION_UNKNOWN");

    // Reconcile with a provider read (order approved, auth CREATED) restores AUTHORIZED.
    const orderAdapter = (async () => ({
      ok: true as const,
      order: {
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: "RECON-AUTH", status: "CREATED", amount: { value: (totalMinor / 100).toFixed(2) } }] } }],
      },
    })) as unknown as typeof import("../../src/integrations/paypal/client").getOrder;
    const reconciled = await reconcileAttempt(prisma, attempt.id, { orderAdapter });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.result.status).toBe("AUTHORIZED");
  });

  it("marks buyer cancellation without any provider call", async () => {
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contractId } });
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "ORDER_CREATED", paypalAuthorizationId: null } });
    const outcome = await markBuyerCancelled(prisma, attempt.paypalOrderId!, customerId);
    expect(outcome.ok).toBe(true);
    const state = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(state.status).toBe("BUYER_CANCELLED");
  });
});
