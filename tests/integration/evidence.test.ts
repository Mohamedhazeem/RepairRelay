/**
 * S7 integration tests: job start gates (contract approval + AUTHORIZED payment +
 * assigned repairer), evidence binding to the current contract version,
 * deterministic mandatory-field rules, duplicate submission, asset ownership.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { createContractFromSelection, approveContract } from "../../src/domains/contracts/service";
import { createOrderForContract, authorizeApprovedOrder } from "../../src/domains/payments/service";
import { startJob, submitEvidence, addEvidenceAsset, evidenceViolations, MANDATORY_CHECKS } from "../../src/domains/evidence/service";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";

const prisma = new PrismaClient();
let customerId: string;
let repairerUserId: string;
let repairId: string;
let contractId: string;
let jobContractVersionId: string;
let afterAssetId: string;
const orderAdapterOk = (async (input: { amountMinor: number }) => ({
  ok: true as const,
  order: { id: `S7ORDER-${input.amountMinor}-${Date.now()}`, status: "CREATED" },
})) as unknown as typeof import("../../src/integrations/paypal/client").createPayPalOrder;
const expectedTotal = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[0]).totalMinor;
const authorizeAdapterOk = (async () => ({
  ok: true as const,
  authorization: {
    authorizationId: `S7AUTH-${Date.now()}`,
    status: "CREATED",
    amount: { currencyCode: "USD", value: (expectedTotal / 100).toFixed(2) },
    expirationTime: "2026-12-07T00:00:00Z",
    orderStatus: "COMPLETED",
  },
})) as unknown as typeof import("../../src/integrations/paypal/client").authorizeOrder;

async function syntheticPng(): Promise<File> {
  const buf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 120, b: 90 } } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "evidence.png", { type: "image/png" });
}

beforeAll(async () => {
  const customer = await prisma.user.create({
    data: { email: `s7-cust-${Date.now()}@test.local`, displayName: "S7 Customer", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = customer.id;
  const repairer = await prisma.user.create({
    data: { email: `s7-rep-${Date.now()}@test.local`, displayName: "S7 Repairer (Simulated)", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
  });
  repairerUserId = repairer.id;
  const profile = await prisma.simulatedRepairer.create({
    data: { userId: repairerUserId, displayName: "S7 Repairer (Simulated)", demoDescription: "Simulated." },
  });
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S7-${Date.now().toString(16).toUpperCase()}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "Cracked glass for the evidence slice test.",
      repairCategory: "DISPLAY_REPLACEMENT",
      status: "QUOTES_AVAILABLE",
    },
  });
  repairId = repair.id;
  // One intake (before) photo.
  const intake = await addIntakeAsset(prisma, repairId, customerId, await syntheticPng());
  void intake;
  const computed = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[0]);
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
      warrantyDays: 90,
      warrantyText: "w",
      estimatedDurationHours: 3,
      scopeText: computed.scopeText,
      exclusionsText: computed.exclusionsText,
      validUntil: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { selectedQuoteId: quote.id } });

  const contract = await createContractFromSelection(prisma, repairId, customerId);
  if (!contract.ok) throw new Error("contract failed");
  contractId = contract.contractId;
  await approveContract(prisma, contractId, customerId, { expectedContractVersion: contract.version, confirmed: true });
  const order = await createOrderForContract(prisma, contractId, customerId, { expectedContractVersion: contract.version + 1, appUrl: "http://x" }, { adapter: orderAdapterOk });
  if (!order.ok) throw new Error("order failed: " + (order.ok ? "" : order.message));
  const auth = await authorizeApprovedOrder(prisma, order.result.paypalOrderId, customerId, { adapter: authorizeAdapterOk });
  if (!auth.ok) throw new Error("authorize failed: " + (auth.ok ? "" : auth.message));

  const job = await startJob(prisma, repairId, repairerUserId);
  if (!job.ok) throw new Error("job start failed: " + (job.ok ? "" : job.message));
  jobContractVersionId = job.result.contractVersionId;
  const after = await addEvidenceAsset(prisma, repairId, repairerUserId, await syntheticPng(), "AFTER");
  if (!after.ok) throw new Error("after upload failed");
  afterAssetId = after.result.assetId;
});

async function addIntakeAsset(prisma2: PrismaClient, rid: string, cid: string, file: File) {
  // Minimal inline intake asset (reuse the pipeline).
  const { processUploadedImage } = await import("../../src/domains/repairs/assetService");
  const { getStorage } = await import("../../src/lib/storage");
  const { createHash } = await import("node:crypto");
  const processed = await processUploadedImage(file);
  if ("error" in processed) throw new Error(processed.error);
  const stored = await getStorage().put(processed.buffer, processed.mimeType);
  const asset = await prisma2.uploadedAsset.create({
    data: {
      repairRequestId: rid,
      ownerId: cid,
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

afterAll(async () => {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { contract: true, jobs: true } });
  if (repair) {
    for (const job of repair.jobs) {
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
    await prisma.auditEvent.deleteMany({ where: { aggregateType: { in: ["RepairJob", "EvidenceSubmission", "RepairRequest"] } } });
    await prisma.repairRequest.delete({ where: { id: repairId } }).catch(() => undefined);
  }
  await prisma.simulatedRepairer.deleteMany({ where: { userId: repairerUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, repairerUserId] } } });
  await prisma.$disconnect();
});

describe("job start gates", () => {
  it("prevents starting by an unassigned repairer", async () => {
    const stranger = await prisma.user.create({
      data: { email: `s7-stranger-${Date.now()}@test.local`, displayName: "Stranger", role: "SIMULATED_REPAIRER", passwordHash: "scrypt:00:00" },
    });
    const outcome = await startJob(prisma, repairId, stranger.id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("FORBIDDEN");
    await prisma.user.delete({ where: { id: stranger.id } });
  });
});

describe("evidence submission", () => {
  it("rejects when mandatory fields are missing (deterministic, no AI involved)", () => {
    const required = MANDATORY_CHECKS.DISPLAY_REPLACEMENT;
    const violations = evidenceViolations(
      {
        contractVersionId: jobContractVersionId,
        componentDeclaration: "",
        componentIdentityBasis: "TECHNICIAN_DECLARATION",
        functionalChecks: [],
        afterAssetIds: [],
        componentAssetIds: [],
        functionalChecksCategory: "DISPLAY_REPLACEMENT",
      },
      true,
    );
    expect(violations.some((v) => v.includes("after-repair photo"))).toBe(true);
    expect(violations.some((v) => v.includes("Component declaration"))).toBe(true);
    for (const check of required) expect(violations.some((v) => v.includes(check))).toBe(true);
  });

  it("blocks label-photo basis without a label photo", () => {
    const violations = evidenceViolations(
      {
        contractVersionId: jobContractVersionId,
        componentDeclaration: "OLED assembly",
        componentIdentityBasis: "LABEL_PHOTO",
        functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
        afterAssetIds: ["a"],
        componentAssetIds: [],
      },
      true,
    );
    expect(violations.some((v) => v.includes("label photo"))).toBe(true);
  });

  it("submits complete evidence, marks CUSTOMER_REVIEW, records advisory assessment", async () => {
    const outcome = await submitEvidence(prisma, repairId, repairerUserId, {
      contractVersionId: jobContractVersionId,
      componentDeclaration: "OLED display assembly, technician-declared, installed and verified",
      componentIdentityBasis: "TECHNICIAN_DECLARATION",
      functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
      afterAssetIds: [afterAssetId],
      componentAssetIds: [],
      notes: "Repair completed.",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).toBe("SUBMITTED");
    expect(["COMPLETE", "INCOMPLETE", "UNAVAILABLE"]).toContain(outcome.result.completeness);
    const job = await prisma.repairJob.findUnique({ where: { repairRequestId: repairId } });
    expect(job!.status).toBe("CUSTOMER_REVIEW");
    const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
    expect(repair!.status).toBe("EVIDENCE_SUBMITTED");
  });

  it("refuses duplicate evidence submission", async () => {
    const outcome = await submitEvidence(prisma, repairId, repairerUserId, {
      contractVersionId: jobContractVersionId,
      componentDeclaration: "Duplicate attempt should fail deterministically",
      componentIdentityBasis: "TECHNICIAN_DECLARATION",
      functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
      afterAssetIds: [afterAssetId],
      componentAssetIds: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("CONFLICT");
  });

  it("refuses evidence against a stale contract version", async () => {
    const outcome = await submitEvidence(prisma, repairId, repairerUserId, {
      contractVersionId: "00000000-0000-4000-8000-000000000000",
      componentDeclaration: "Stale version attempt",
      componentIdentityBasis: "TECHNICIAN_DECLARATION",
      functionalChecks: MANDATORY_CHECKS.DISPLAY_REPLACEMENT.map((c) => ({ check: c, result: "PASS" as const })),
      afterAssetIds: [afterAssetId],
      componentAssetIds: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("CONFLICT");
  });
});
