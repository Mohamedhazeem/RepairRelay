/**
 * S10 tests: passport gating (accepted + confirmed capture only), ownership,
 * historical labels, unavailable evidence assets.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { collectAggregateIds, deleteAuditEventsFor } from "../helpers/auditCleanup";
import sharp from "sharp";
import { createContractFromSelection, approveContract } from "../../src/domains/contracts/service";
import { createOrderForContract, authorizeApprovedOrder } from "../../src/domains/payments/service";
import { captureAfterAcceptance } from "../../src/domains/payments/orchestration";
import { startJob, submitEvidence, addEvidenceAsset, MANDATORY_CHECKS } from "../../src/domains/evidence/service";
import { recordCustomerDecision } from "../../src/domains/decisions/service";
import { getPassport } from "../../src/domains/passport/service";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";
import { processUploadedImage } from "../../src/domains/repairs/assetService";
import { getStorage } from "../../src/lib/storage";

const prisma = new PrismaClient();
let customerId: string;
let otherCustomerId: string;
let repairerUserId: string;
let simulatedRepairerId: string;
const createdRepairIds: string[] = [];

const orderAdapter = (async (input: { amountMinor: number }) => ({
  ok: true as const,
  order: { id: `S10-${input.amountMinor}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status: "CREATED" },
})) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;
const authorizeAdapterFor = (amountMinor: number) =>
  (async () => ({
    ok: true as const,
    authorization: {
      authorizationId: `S10AUTH-${Date.now()}`,
      status: "CREATED",
      amount: { currencyCode: "USD", value: (amountMinor / 100).toFixed(2) },
      expirationTime: "2026-12-07T00:00:00Z",
      orderStatus: "COMPLETED",
    },
  })) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;
const captureAdapter = (async () => ({
  ok: true as const,
  capture: { captureId: `S10CAP-${Date.now()}`, status: "COMPLETED", amount: null },
})) as unknown as typeof import("../../src/integrations/paypal/client").captureAuthorization;

async function syntheticPng(): Promise<File> {
  const buf = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 120, g: 20, b: 90 } } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "e.png", { type: "image/png" });
}

async function setupCompleteRepair(): Promise<{ repairId: string; afterAssetId: string }> {
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S10-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "S10 passport fixture.",
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
  if (!contract.ok) throw new Error("contract failed");
  const approved = await approveContract(prisma, contract.contractId, customerId, { expectedContractVersion: contract.version, confirmed: true });
  if (!approved.ok) throw new Error("approval failed");
  const order = await createOrderForContract(prisma, contract.contractId, customerId, { expectedContractVersion: approved.version, appUrl: "http://x" }, { adapter: orderAdapter });
  if (!order.ok) throw new Error("order failed");
  const auth = await authorizeApprovedOrder(prisma, order.result.paypalOrderId, customerId, { adapter: authorizeAdapterFor(computed.totalMinor) });
  if (!auth.ok) throw new Error("authorize failed");
  const job = await startJob(prisma, repair.id, repairerUserId);
  if (!job.ok) throw new Error("job failed");
  const after = await addEvidenceAsset(prisma, repair.id, repairerUserId, await syntheticPng(), "AFTER");
  if (!after.ok) throw new Error("after failed");
  const submission = await submitEvidence(prisma, repair.id, repairerUserId, {
    contractVersionId: job.result.contractVersionId,
    componentDeclaration: "OLED display assembly, technician-declared",
    componentIdentityBasis: "TECHNICIAN_DECLARATION",
    functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
    afterAssetIds: [after.result.assetId],
    componentAssetIds: [],
  });
  if (!submission.ok) throw new Error("submission failed");
  const decision = await recordCustomerDecision(prisma, repair.id, customerId, {
    evidenceSubmissionId: submission.result.submissionId,
    contractVersionId: job.result.contractVersionId,
    decision: "ACCEPT",
  });
  if (!decision.ok) throw new Error("accept failed");
  return { repairId: repair.id, afterAssetId: after.result.assetId };
}

beforeAll(async () => {
  const customer = await prisma.user.create({
    data: { email: `s10-cust-${Date.now()}@test.local`, displayName: "S10 Customer", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = customer.id;
  const other = await prisma.user.create({
    data: { email: `s10-other-${Date.now()}@test.local`, displayName: "S10 Other", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  otherCustomerId = other.id;
  const repairer = await prisma.user.create({
    data: { email: `s10-rep-${Date.now()}@test.local`, displayName: "S10 Repairer (Simulated)", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
  });
  repairerUserId = repairer.id;
  const profile = await prisma.simulatedRepairer.create({
    data: { userId: repairerUserId, displayName: "S10 Repairer (Simulated)", demoDescription: "Simulated." },
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

describe("repair passport", () => {
  it("is unavailable before acceptance and confirmed capture", async () => {
    const ids = await setupCompleteRepair(); // accepted but NOT captured yet
    const outcome = await getPassport(prisma, ids.repairId, customerId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.passportAvailable).toBe(false);
    if (outcome.passportAvailable) return;
    expect(outcome.reason).toContain("capture is confirmed");
  });

  it("is unavailable when captured but the repair is not accepted", async () => {
    const ids = await setupCompleteRepair();
    // Capture without a decision would be blocked by guards; simulate a captured attempt directly.
    const contract = await prisma.repairContract.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } });
    await prisma.paymentAttempt.updateMany({
      where: { repairContractId: contract.id },
      data: { status: "CAPTURED", paypalCaptureId: "ORPHAN-CAP", rawCaptureStatus: "COMPLETED" },
    });
    const outcome = await getPassport(prisma, ids.repairId, customerId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.passportAvailable).toBe(false); // job not ACCEPTED → no passport
  });

  it("refuses other users", async () => {
    const ids = await setupCompleteRepair();
    const outcome = await getPassport(prisma, ids.repairId, otherCustomerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_FOUND");
  });

  it("issues after acceptance + capture with historical labels and timeline", async () => {
    const ids = await setupCompleteRepair();
    const capture = await captureAfterAcceptance(prisma, (await prisma.repairContract.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } })).id, customerId, { captureAdapter });
    expect(capture.ok).toBe(true);
    const outcome = await getPassport(prisma, ids.repairId, customerId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.passportAvailable) return;
    const p = outcome.passport;
    expect(p.payment.captureId).toMatch(/^S10CAP-/);
    expect(p.payment.amountMinor).toBeGreaterThan(0);
    expect(p.repairer.demoLabel).toBe("SIMULATED");
    expect(p.contract.terms.quote.compatibilityNotes.toLowerCase()).toContain("simulated");
    expect(p.functionalChecks.length).toBe(MANDATORY_CHECKS.DISPLAY_REPLACEMENT.length);
    expect(p.evidence.some((e) => e.evidenceType === "AFTER" && e.available)).toBe(true);
    // Timeline is chronological and includes the capture event.
    const times = p.timeline.map((t) => t.at);
    expect([...times].sort()).toEqual(times);
    expect(p.timeline.some((t) => t.eventType === "payment.captured")).toBe(true);
    expect(p.timeline.some((t) => t.eventType === "decision.accepted")).toBe(true);
  });

  it("marks evidence unavailable when stored content is missing, without failing the passport", async () => {
    const ids = await setupCompleteRepair();
    const capture = await captureAfterAcceptance(prisma, (await prisma.repairContract.findUniqueOrThrow({ where: { repairRequestId: ids.repairId } })).id, customerId, { captureAdapter });
    expect(capture.ok).toBe(true);
    // Remove the stored file directly.
    const asset = await prisma.uploadedAsset.findUniqueOrThrow({ where: { id: ids.afterAssetId } });
    await getStorage().remove(asset.storageKey);
    const outcome = await getPassport(prisma, ids.repairId, customerId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.passportAvailable) return;
    const after = outcome.passport.evidence.find((e) => e.assetId === ids.afterAssetId);
    expect(after?.available).toBe(false);
  });
});
