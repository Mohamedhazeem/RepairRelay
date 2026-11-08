/**
 * S8 integration tests: decision immutability, latest-evidence + version guards,
 * rework cap and no-capture guarantee, cancel without authorization, cancel with
 * authorization (void orchestration), duplicate decisions and ownership.
 * Orchestration hooks are injected fakes; every fixture is registered for cleanup.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { collectAggregateIds, deleteAuditEventsFor } from "../helpers/auditCleanup";
import sharp from "sharp";
import { createContractFromSelection, approveContract } from "../../src/domains/contracts/service";
import { createOrderForContract, authorizeApprovedOrder } from "../../src/domains/payments/service";
import { startJob, submitEvidence, addEvidenceAsset, MANDATORY_CHECKS } from "../../src/domains/evidence/service";
import { recordCustomerDecision } from "../../src/domains/decisions/service";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";
import { processUploadedImage } from "../../src/domains/repairs/assetService";
import { getStorage } from "../../src/lib/storage";

const prisma = new PrismaClient();
let customerId: string;
let otherCustomerId: string;
let repairerUserId: string;
let simulatedRepairerId: string;
const createdRepairIds: string[] = [];

async function syntheticPng(): Promise<File> {
  const buf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 40, g: 80, b: 160 } } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "e.png", { type: "image/png" });
}

async function createIntakeAsset(repairId: string): Promise<string> {
  const processed = await processUploadedImage(await syntheticPng());
  if ("error" in processed) throw new Error(processed.error);
  const stored = await getStorage().put(processed.buffer, processed.mimeType);
  const { createHash } = await import("node:crypto");
  const asset = await prisma.uploadedAsset.create({
    data: {
      repairRequestId: repairId,
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
  return asset.id;
}

const orderAdapter = (async (input: { amountMinor: number }) => ({
  ok: true as const,
  order: { id: `S8-${input.amountMinor}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status: "CREATED" },
})) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;

function authorizeAdapterFor(amountMinor: number) {
  return (async () => ({
    ok: true as const,
    authorization: {
      authorizationId: `S8AUTH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: "CREATED",
      amount: { currencyCode: "USD", value: (amountMinor / 100).toFixed(2) },
      expirationTime: "2026-12-07T00:00:00Z",
      orderStatus: "COMPLETED",
    },
  })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
}

/** Full fixture: repair → intake photo → selected quote → approved contract → optional authorized payment → job → evidence. */
async function setupRepair(opts: { withPayment: boolean }): Promise<{
  repairId: string;
  contractVersionId: string;
  submissionId: string;
  afterAssetId: string;
}> {
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S8-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "Fixture repair for decision branching tests.",
      repairCategory: "DISPLAY_REPLACEMENT",
      status: "QUOTES_AVAILABLE",
    },
  });
  createdRepairIds.push(repair.id);
  await createIntakeAsset(repair.id);
  const computed = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[1]);
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
      warrantyDays: 180,
      warrantyText: "w",
      estimatedDurationHours: 4,
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
  const job = await startJob(prisma, repair.id, repairerUserId);
  if (!job.ok) throw new Error("fixture job failed: " + (job.ok ? "" : job.message));
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
  return { repairId: repair.id, contractVersionId: job.result.contractVersionId, submissionId: submission.result.submissionId, afterAssetId: after.result.assetId };
}

beforeAll(async () => {
  const customer = await prisma.user.create({
    data: { email: `s8-cust-${Date.now()}@test.local`, displayName: "S8 Customer", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = customer.id;
  const other = await prisma.user.create({
    data: { email: `s8-other-${Date.now()}@test.local`, displayName: "S8 Other", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  otherCustomerId = other.id;
  const repairer = await prisma.user.create({
    data: { email: `s8-rep-${Date.now()}@test.local`, displayName: "S8 Repairer (Simulated)", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
  });
  repairerUserId = repairer.id;
  const profile = await prisma.simulatedRepairer.create({
    data: { userId: repairerUserId, displayName: "S8 Repairer (Simulated)", demoDescription: "Simulated." },
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
      await prisma.contractVersion.deleteMany({ where: { contractId: repair.contract.id } });
      await prisma.repairContract.delete({ where: { id: repair.contract.id } });
    }
    await prisma.uploadedAsset.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.repairQuote.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.repairRequest.delete({ where: { id: repairId } }).catch(() => undefined);
  }
  await prisma.simulatedRepairer.deleteMany({ where: { userId: repairerUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, repairerUserId] } } });
  await prisma.$disconnect();
});

describe("customer decisions", () => {
  it("rejects decisions by non-owners", async () => {
    const ids = await setupRepair({ withPayment: true });
    const outcome = await recordCustomerDecision(prisma, ids.repairId, otherCustomerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "ACCEPT",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_FOUND");
  });

  it("accepts with orchestration and records an immutable decision", async () => {
    const ids = await setupRepair({ withPayment: true });
    let captureCalled = 0;
    const outcome = await recordCustomerDecision(
      prisma,
      ids.repairId,
      customerId,
      { evidenceSubmissionId: ids.submissionId, contractVersionId: ids.contractVersionId, decision: "ACCEPT" },
      { capture: async () => { captureCalled += 1; } },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.orchestrationRequested).toBe(true);
    expect(captureCalled).toBe(1);
    const job = await prisma.repairJob.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } });
    expect(job.status).toBe("ACCEPTED");
    expect(job.acceptedAt).not.toBeNull();
    // No other payment operation was created by the decision itself.
    const attempts = await prisma.paymentAttempt.findFirst({ where: { repairContractId: (await prisma.repairContract.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } })).id } });
    expect(attempts!.status).toBe("AUTHORIZED");
  });

  it("refuses duplicate decisions on the same submission (double click safe)", async () => {
    const ids = await setupRepair({ withPayment: true });
    const first = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "ACCEPT",
    });
    expect(first.ok).toBe(true);
    const again = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "ACCEPT",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("CONFLICT");
  });

  it("requires a comment for rework and caps the rework cycle at one", async () => {
    const ids = await setupRepair({ withPayment: true });
    const noComment = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "REQUEST_REWORK",
    });
    expect(noComment.ok).toBe(false);
    if (!noComment.ok) expect(noComment.code).toBe("VALIDATION_ERROR");

    const first = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "REQUEST_REWORK",
      comment: "Brightness control does not respond on the left edge.",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.jobStatus).toBe("REWORK_IN_PROGRESS");

    // Repairer resubmits; a second rework request must hit the cap.
    const resub = await submitEvidence(prisma, ids.repairId, repairerUserId, {
      contractVersionId: ids.contractVersionId,
      componentDeclaration: "OLED display assembly, technician-declared, rechecked",
      componentIdentityBasis: "TECHNICIAN_DECLARATION",
      functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
      afterAssetIds: [ids.afterAssetId],
      componentAssetIds: [],
    });
    expect(resub.ok).toBe(true);
    if (!resub.ok) return;
    const second = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: resub.result.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "REQUEST_REWORK",
      comment: "Still not fixed, requesting another cycle.",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("CONFLICT");
  });

  it("cancels without a voidable authorization without any provider call (expired auth)", async () => {
    const ids = await setupRepair({ withPayment: true });
    // Simulate authorization expiry before the customer decides.
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } });
    await prisma.paymentAttempt.updateMany({ where: { repairContractId: contract.id }, data: { status: "AUTHORIZATION_EXPIRED" } });
    const outcome = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: ids.contractVersionId,
      decision: "CANCEL",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.jobStatus).toBe("CANCELLED");
    expect(outcome.result.orchestrationRequested).toBe(false);
    const job = await prisma.repairJob.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } });
    expect(job.cancelledAt).not.toBeNull();
    const repair = await prisma.repairRequest.findUniqueOrThrow({ where: { id: ids.repairId } });
    expect(repair.status).toBe("CANCELLED");
  });

  it("requests void on cancel when an uncaptured authorization exists; final state waits for confirmed void", async () => {
    const ids = await setupRepair({ withPayment: true });
    let voidCalled = 0;
    const outcome = await recordCustomerDecision(
      prisma,
      ids.repairId,
      customerId,
      { evidenceSubmissionId: ids.submissionId, contractVersionId: ids.contractVersionId, decision: "CANCEL" },
      { void: async () => { voidCalled += 1; } },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.jobStatus).toBe("CANCEL_REQUESTED");
    expect(voidCalled).toBe(1);
    const job = await prisma.repairJob.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } });
    expect(job.status).toBe("CANCEL_REQUESTED"); // CANCELLED only after confirmed void
  });

  it("refuses decisions against a stale contract version or unknown evidence", async () => {
    const ids = await setupRepair({ withPayment: true });
    const staleVersion = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: ids.submissionId,
      contractVersionId: "00000000-0000-4000-8000-000000000000",
      decision: "ACCEPT",
    });
    expect(staleVersion.ok).toBe(false);
    if (!staleVersion.ok) expect(staleVersion.code).toBe("CONFLICT");

    const staleEvidence = await recordCustomerDecision(prisma, ids.repairId, customerId, {
      evidenceSubmissionId: "00000000-0000-4000-8000-000000000000",
      contractVersionId: ids.contractVersionId,
      decision: "ACCEPT",
    });
    expect(staleEvidence.ok).toBe(false);
    if (!staleEvidence.ok) expect(staleEvidence.code).toBe("CONFLICT");
  });
});
