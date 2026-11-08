/**
 * S9 edge-case tests: capture guards (accept decision required, expiry, CAS
 * races), void-after-capture, authorization-resource reconciliation, and the
 * amount-change void path through the S5 decision flow.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { collectAggregateIds, deleteAuditEventsFor } from "../helpers/auditCleanup";
import { createContractFromSelection, approveContract, createChangeRequest, decideChangeRequest } from "../../src/domains/contracts/service";
import { createOrderForContract, authorizeApprovedOrder, reconcileAttempt } from "../../src/domains/payments/service";
import { captureAfterAcceptance, voidAfterCancellation } from "../../src/domains/payments/orchestration";
import { startJob, submitEvidence, addEvidenceAsset, MANDATORY_CHECKS } from "../../src/domains/evidence/service";
import { recordCustomerDecision } from "../../src/domains/decisions/service";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";
import { processUploadedImage } from "../../src/domains/repairs/assetService";
import { getStorage } from "../../src/lib/storage";
import sharp from "sharp";

const prisma = new PrismaClient();
let customerId: string;
let repairerUserId: string;
let simulatedRepairerId: string;
const createdRepairIds: string[] = [];

async function syntheticPng(): Promise<File> {
  const buf = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 90, g: 20, b: 120 } } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "e.png", { type: "image/png" });
}

const orderAdapter = (async (input: { amountMinor: number }) => ({
  ok: true as const,
  order: { id: `S9-${input.amountMinor}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status: "CREATED" },
})) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;

function authorizeAdapterFor(amountMinor: number) {
  return (async () => ({
    ok: true as const,
    authorization: {
      authorizationId: `S9AUTH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: "CREATED",
      amount: { currencyCode: "USD", value: (amountMinor / 100).toFixed(2) },
      expirationTime: "2026-12-07T00:00:00Z",
      orderStatus: "COMPLETED",
    },
  })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
}

const captureAdapterOk = (async () => ({
  ok: true as const,
  capture: { captureId: `S9CAP-${Date.now()}`, status: "COMPLETED", amount: { currencyCode: "USD", value: "0" } },
})) as unknown as typeof import("../../src/integrations/paypal/client").captureAuthorization;

/** Fixture to a given state: contract approved (+optional auth, +optional accepted). */
async function setupRepair(opts: { withPayment: boolean; accept?: boolean }): Promise<{
  repairId: string;
  contractId: string;
  contractVersionId: string;
  totalMinor: number;
}> {
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S9-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "S9 edge-case fixture.",
      repairCategory: "DISPLAY_REPLACEMENT",
      status: "QUOTES_AVAILABLE",
    },
  });
  createdRepairIds.push(repair.id);
  const processed = await processUploadedImage(await syntheticPng());
  if ("error" in processed) throw new Error(processed.error);
  const stored = await getStorage().put(processed.buffer, processed.mimeType);
  const { createHash } = await import("node:crypto");
  await prisma.uploadedAsset.create({
    data: {
      repairRequestId: repair.id,
      ownerId: customerId,
      assetKind: "INTAKE",
      storageKey: stored.storageKey,
      mimeType: processed.mimeType,
      byteSize: processed.buffer.byteLength,
      width: processed.width,
      height: processed.height,
      sha256: createHash("sha256").update(processed.buffer).digest("hex"),
    },
  });
  const computed = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[0]);
  const quote = await prisma.repairQuote.create({
    data: {
      repairRequestId: repair.id,
      repairerId: simulatedRepairerId,
      status: "SELECTED",
      componentLabel: computed.componentLabel,
      compatibilityAttestation: "CONFIRMED_FOR_DEMO",
      compatibilityNotes: "Simulated.",
      partChargeMinor: computed.partChargeMinor,
      labourMinor: computed.labourMinor,
      totalMinor: computed.totalMinor,
      currency: "USD",
      warrantyDays: 90,
      warrantyText: "w",
      estimatedDurationHours: 3,
      scopeText: computed.scopeText,
      exclusionsText: computed.exclusionsText,
      validUntil: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });
  await prisma.repairRequest.update({ where: { id: repair.id }, data: { selectedQuoteId: quote.id } });
  const contract = await createContractFromSelection(prisma, repair.id, customerId);
  if (!contract.ok) throw new Error("fixture contract failed");
  const approved = await approveContract(prisma, contract.contractId, customerId, { expectedContractVersion: contract.version, confirmed: true });
  if (!approved.ok) throw new Error("fixture approval failed");

  if (opts.withPayment) {
    const order = await createOrderForContract(prisma, contract.contractId, customerId, { expectedContractVersion: approved.version, appUrl: "http://x" }, { adapter: orderAdapter });
    if (!order.ok) throw new Error("fixture order failed");
    const auth = await authorizeApprovedOrder(prisma, order.result.paypalOrderId, customerId, { adapter: authorizeAdapterFor(computed.totalMinor) });
    if (!auth.ok) throw new Error("fixture authorize failed");
  }
  if (opts.accept) {
    const job = await startJob(prisma, repair.id, repairerUserId);
    if (!job.ok) throw new Error("fixture job failed");
    const after = await addEvidenceAsset(prisma, repair.id, repairerUserId, await syntheticPng(), "AFTER");
    if (!after.ok) throw new Error("fixture after failed");
    const submission = await submitEvidence(prisma, repair.id, repairerUserId, {
      contractVersionId: job.result.contractVersionId,
      componentDeclaration: "OLED display assembly, technician-declared",
      componentIdentityBasis: "TECHNICIAN_DECLARATION",
      functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
      afterAssetIds: [after.result.assetId],
      componentAssetIds: [],
    });
    if (!submission.ok) throw new Error("fixture submission failed");
    const decision = await recordCustomerDecision(prisma, repair.id, customerId, {
      evidenceSubmissionId: submission.result.submissionId,
      contractVersionId: job.result.contractVersionId,
      decision: "ACCEPT",
    });
    if (!decision.ok) throw new Error("fixture accept failed");
  }
  const contractRow = await prisma.repairContract.findUniqueOrThrow({ where: { id: contract.contractId } });
  return { repairId: repair.id, contractId: contract.contractId, contractVersionId: contractRow.currentVersionId!, totalMinor: computed.totalMinor };
}

beforeAll(async () => {
  const customer = await prisma.user.create({
    data: { email: `s9-cust-${Date.now()}@test.local`, displayName: "S9 Customer", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = customer.id;
  const repairer = await prisma.user.create({
    data: { email: `s9-rep-${Date.now()}@test.local`, displayName: "S9 Repairer (Simulated)", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
  });
  repairerUserId = repairer.id;
  const profile = await prisma.simulatedRepairer.create({
    data: { userId: repairerUserId, displayName: "S9 Repairer (Simulated)", demoDescription: "Simulated." },
  });
  simulatedRepairerId = profile.id;
});

afterAll(async () => {
  await deleteAuditEventsFor(prisma, await collectAggregateIds(prisma, [createdRepairIds].flat()));
  for (const repairId of createdRepairIds) {
    const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { contract: true, jobs: true } });
    if (!repair) continue;
    for (const job of repair.jobs) {
      await prisma.customerDecision.deleteMany({ where: { repairJobId: job.id } });
      await prisma.evidenceAssessment.deleteMany({ where: { submission: { repairJobId: job.id } } });
      await prisma.evidenceAsset.deleteMany({ where: { submission: { repairJobId: job.id } } });
      await prisma.evidenceSubmission.deleteMany({ where: { repairJobId: job.id } });
      await prisma.repairJob.delete({ where: { id: job.id } });
    }
    if (repair.contract) {
      await prisma.paymentOperation.deleteMany({ where: { attempt: { repairContractId: repair.contract.id } } });
      await prisma.paymentAttempt.deleteMany({ where: { repairContractId: repair.contract.id } });
      await prisma.contractChangeRequest.deleteMany({ where: { contractId: repair.contract.id } });
      await prisma.contractVersion.deleteMany({ where: { contractId: repair.contract.id } });
      await prisma.repairContract.delete({ where: { id: repair.contract.id } });
    }
    await prisma.uploadedAsset.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.repairQuote.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.repairRequest.delete({ where: { id: repairId } }).catch(() => undefined);
  }
  await prisma.simulatedRepairer.deleteMany({ where: { userId: repairerUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, repairerUserId] } } });
  await prisma.$disconnect();
});

describe("capture guards", () => {
  it("refuses capture without an explicit ACCEPT decision on the current version", async () => {
    const ids = await setupRepair({ withPayment: true });
    const outcome = await captureAfterAcceptance(prisma, ids.contractId, customerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain("explicit customer acceptance");
  });

  it("blocks capture of an expired authorization and marks AUTHORIZATION_EXPIRED", async () => {
    const ids = await setupRepair({ withPayment: true, accept: true });
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    await prisma.paymentAttempt.updateMany({
      where: { repairContractId: contract.id },
      data: { authorizationExpiresAt: new Date(Date.now() - 1000) },
    });
    const outcome = await captureAfterAcceptance(prisma, ids.contractId, customerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain("expired");
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contract.id } });
    expect(attempt.status).toBe("AUTHORIZATION_EXPIRED");
  });

  it("guards concurrent captures at the DB level (CAS)", async () => {
    const ids = await setupRepair({ withPayment: true, accept: true });
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    // Simulate a competing in-flight capture.
    await prisma.paymentAttempt.updateMany({ where: { repairContractId: contract.id }, data: { status: "CAPTURE_PENDING" } });
    const outcome = await captureAfterAcceptance(prisma, ids.contractId, customerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("CONFLICT"); // status guard fires before CAS
  });

  it("captures successfully with guards satisfied, then forbids void-after-capture", async () => {
    const ids = await setupRepair({ withPayment: true, accept: true });
    const capture = await captureAfterAcceptance(prisma, ids.contractId, customerId, { traceId: "s9-test", captureAdapter: captureAdapterOk });
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    expect(capture.status).toBe("CAPTURED");

    const voidAttempt = await voidAfterCancellation(prisma, ids.contractId, customerId);
    expect(voidAttempt.ok).toBe(false);
    if (!voidAttempt.ok) expect(voidAttempt.message).toContain("void is not possible");
  });
});

describe("void and reconciliation", () => {
  it("voids an uncaptured authorization and reconciles via the authorization resource", async () => {
    const ids = await setupRepair({ withPayment: true });
    const voided = await voidAfterCancellation(prisma, ids.contractId, customerId, { voidAdapter: (async () => ({ ok: true as const })) as unknown as typeof import("../../src/integrations/paypal/client").voidAuthorization });
    expect(voided.ok).toBe(true);
    if (!voided.ok) return;
    expect(voided.status).toBe("VOIDED");
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contract.id } });
    expect(attempt.status).toBe("VOIDED");

    // Reconcile from a provider authorization read (VOIDED) keeps the state.
    const authAdapter = (async () => ({
      ok: true as const,
      authorization: { status: "VOIDED", expiration_time: attempt.authorizationExpiresAt?.toISOString() ?? null },
    })) as unknown as typeof import("../../src/integrations/paypal/client").getAuthorization;
    const reconciled = await reconcileAttempt(prisma, attempt.id, { authAdapter, orderAdapter: (async () => ({ ok: false as const, error: { kind: "PROVIDER_ERROR" as const, status: 500 } })) as unknown as typeof import("../../src/integrations/paypal/client").getOrder });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.result.status).toBe("VOIDED");
  });

  it("resolves an unknown capture to CAPTURED via the authorization resource", async () => {
    const ids = await setupRepair({ withPayment: true, accept: true });
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    // Simulate a capture whose outcome was lost (client disconnected after provider success).
    await prisma.paymentAttempt.updateMany({ where: { repairContractId: contract.id }, data: { status: "CAPTURE_UNKNOWN" } });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contract.id } });
    const authAdapter = (async () => ({
      ok: true as const,
      authorization: { status: "CAPTURED", expiration_time: null },
    })) as unknown as typeof import("../../src/integrations/paypal/client").getAuthorization;
    const reconciled = await reconcileAttempt(prisma, attempt.id, { authAdapter, orderAdapter: (async () => ({ ok: false as const, error: { kind: "PROVIDER_ERROR" as const, status: 500 } })) as unknown as typeof import("../../src/integrations/paypal/client").getOrder });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.result.status).toBe("CAPTURED");
    const updated = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(updated.status).toBe("CAPTURED");
    const repair = await prisma.repairRequest.findUniqueOrThrow({ where: { id: ids.repairId } });
    expect(repair.status).toBe("COMPLETED");
  });

  it("resolves an unknown capture to AUTHORIZED when the provider shows it uncaptured", async () => {
    const ids = await setupRepair({ withPayment: true, accept: true });
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    await prisma.paymentAttempt.updateMany({ where: { repairContractId: contract.id }, data: { status: "CAPTURE_UNKNOWN" } });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: contract.id } });
    const authAdapter = (async () => ({
      ok: true as const,
      authorization: { status: "CREATED", expiration_time: "2026-12-07T00:00:00Z" },
    })) as unknown as typeof import("../../src/integrations/paypal/client").getAuthorization;
    const reconciled = await reconcileAttempt(prisma, attempt.id, { authAdapter, orderAdapter: (async () => ({ ok: false as const, error: { kind: "PROVIDER_ERROR" as const, status: 500 } })) as unknown as typeof import("../../src/integrations/paypal/client").getOrder });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.result.status).toBe("AUTHORIZED");
  });
});

describe("amount-change void path (S04 contract consumed by S5 decision flow)", () => {
  it("voids the old authorization when the customer approves a changed amount", async () => {
    const ids = await setupRepair({ withPayment: true });
    const proposal = await createChangeRequest(prisma, ids.contractId, repairerUserId, {
      expectedContractVersion: 2, // contract.version after approval CAS
      reason: "The declared assembly is unavailable; proposing an equivalent at a higher part charge.",
      proposedChanges: { partChargeMinor: 8999 },
    });
    if (!proposal.ok) console.log("DEBUG proposal:", proposal.code, proposal.message);
    expect(proposal.ok).toBe(true);
    const contractRow = await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } });
    const cr = await prisma.contractChangeRequest.findFirstOrThrow({ where: { contractId: ids.contractId, status: "PENDING" } });
    const decision = await decideChangeRequest(prisma, cr.id, customerId, { decision: "APPROVE", expectedContractVersion: contractRow.version });
    if (!decision.ok) console.log("DEBUG decision:", decision.code, decision.message);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.amountChanged).toBe(true);

    // Wire-up: amount change with an existing authorization must void it before re-authorization.
    const payment = await prisma.paymentAttempt.findFirstOrThrow({ where: { repairContractId: ids.contractId }, orderBy: { createdAt: "desc" } });
    if (payment.status === "AUTHORIZED") {
      const voided = await voidAfterCancellation(prisma, ids.contractId, customerId, { voidAdapter: (async () => ({ ok: true as const })) as unknown as typeof import("../../src/integrations/paypal/client").voidAuthorization, contractChange: true });
      expect(voided.ok).toBe(true);
      if (!voided.ok) return;
      expect(voided.status).toBe("VOIDED");
      // A new order for the new amount is now permitted (old authorization void confirmed).
      const versionNow = (await prisma.repairContract.findUniqueOrThrow({ where: { id: ids.contractId } })).version;
      const newOrder = await createOrderForContract(prisma, ids.contractId, customerId, { expectedContractVersion: versionNow, appUrl: "http://x" }, { adapter: orderAdapter });
      expect(newOrder.ok).toBe(true);
      if (!newOrder.ok) return;
      expect(newOrder.result.amountMinor).toBe(8999 + 3499);
    }
  });
});
