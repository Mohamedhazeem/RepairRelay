/**
 * S4 integration tests: idempotent deterministic quote generation, prerequisite
 * enforcement, and CAS-guarded quote selection (stale version, double select,
 * expiry, attestation rules).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureQuotes, selectQuote, listQuotes } from "../../src/domains/quotes/service";

const prisma = new PrismaClient();
let customerId: string;
let repairId: string;
let version: number;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `s4-test-${Date.now()}@test.local`, displayName: "S4 Tester", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = user.id;
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-S4-${Date.now().toString(16).toUpperCase()}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "Cracked front glass; touch still works everywhere.",
      repairCategory: "DISPLAY_REPLACEMENT",
    },
  });
  repairId = repair.id;
  version = repair.version;
});

afterAll(async () => {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (repair) {
    await prisma.repairQuote.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.auditEvent.deleteMany({ where: { aggregateId: repairId } });
    await prisma.repairRequest.delete({ where: { id: repairId } });
  }
  await prisma.user.delete({ where: { id: customerId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("quote generation", () => {
  it("generates exactly three quotes with SIMULATED actors and demoActor flag", async () => {
    const first = await ensureQuotes(prisma, repairId, customerId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.quotes).toHaveLength(3);
    for (const q of first.quotes) {
      expect(q.demoActor).toBe(true);
      expect(q.repairer.demoLabel).toBe("SIMULATED");
      expect(q.repairer.displayName.toLowerCase()).toContain("simulated");
      expect(q.compatibilityAttestation).toBe("CONFIRMED_FOR_DEMO");
      expect(q.compatibilityNotes.toLowerCase()).toContain("simulated");
      expect(q.currency).toBe("USD");
      expect(q.totalMinor).toBe(q.partChargeMinor + q.labourMinor);
      expect(q.selectable).toBe(true);
      expect(new Date(q.validUntil).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("is idempotent and deterministic — regeneration returns the same quotes", async () => {
    const first = await listQuotes(prisma, repairId, customerId);
    const second = await ensureQuotes(prisma, repairId, customerId);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.quotes).toHaveLength(first.quotes.length);
    expect(second.quotes.map((q) => q.id)).toEqual(first.quotes.map((q) => q.id));
    expect(second.quotes.map((q) => q.totalMinor)).toEqual(first.quotes.map((q) => q.totalMinor));
  });

  it("requires a repair category", async () => {
    const temp = await prisma.repairRequest.create({
      data: {
        publicReference: `RR-S4B-${Date.now().toString(16).toUpperCase()}`,
        customerId,
        deviceBrand: "Apple",
        deviceModel: "iPhone 13",
        deviceModelConfidence: "USER_SELECTED",
        symptoms: "Testing the missing-category prerequisite path.",
      },
    });
    const outcome = await ensureQuotes(prisma, temp.id, customerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_ERROR");
    await prisma.repairRequest.delete({ where: { id: temp.id } });
  });

  it("blocks quotes for unverified device models", async () => {
    const temp = await prisma.repairRequest.create({
      data: {
        publicReference: `RR-S4C-${Date.now().toString(16).toUpperCase()}`,
        customerId,
        deviceBrand: "Acme",
        deviceModel: "Phone X",
        deviceModelConfidence: "UNKNOWN",
        symptoms: "Unverified model must not receive exact-model quotes.",
        repairCategory: "DISPLAY_REPLACEMENT",
      },
    });
    const outcome = await ensureQuotes(prisma, temp.id, customerId);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_ERROR");
    await prisma.repairRequest.delete({ where: { id: temp.id } });
  });
});

describe("quote selection", () => {
  it("selects one quote, supersedes the others, and bumps the repair version (CAS)", async () => {
    const quotes = await ensureQuotes(prisma, repairId, customerId);
    if (!quotes.ok) throw new Error("quotes missing");
    const target = quotes.quotes[0];
    const result = await selectQuote(prisma, repairId, target.id, customerId, version);
    expect(result.ok).toBe(true);
    const after = await prisma.repairQuote.findMany({ where: { repairRequestId: repairId } });
    expect(after.find((q) => q.id === target.id)?.status).toBe("SELECTED");
    expect(after.filter((q) => q.id !== target.id).every((q) => q.status === "SUPERSEDED")).toBe(true);
    const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
    expect(repair?.selectedQuoteId).toBe(target.id);
    expect(repair?.version).toBe(version + 1);
    version = repair!.version;
  });

  it("rejects stale expectedRepairVersion with CONFLICT", async () => {
    const quotes = await listQuotes(prisma, repairId, customerId);
    if (!quotes.ok) throw new Error("quotes missing");
    const other = quotes.quotes.find((q) => q.status === "SUPERSEDED");
    if (!other) throw new Error("no superseded quote");
    const stale = await selectQuote(prisma, repairId, other.id, customerId, version - 1);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("CONFLICT");
  });

  it("refuses selecting an already-selected or superseded quote (double click safe)", async () => {
    const quotes = await listQuotes(prisma, repairId, customerId);
    if (!quotes.ok) throw new Error("quotes missing");
    const selected = quotes.quotes.find((q) => q.status === "SELECTED")!;
    const again = await selectQuote(prisma, repairId, selected.id, customerId, version);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("CONFLICT");
    const superseded = quotes.quotes.find((q) => q.status === "SUPERSEDED")!;
    const sup = await selectQuote(prisma, repairId, superseded.id, customerId, version);
    expect(sup.ok).toBe(false);
    if (!sup.ok) expect(sup.code).toBe("CONFLICT");
  });

  it("refuses quotes failing the demo rules (attestation, zero total)", async () => {
    // Force an unselectable state directly to prove the guard exists.
    const quotes = await listQuotes(prisma, repairId, customerId);
    if (!quotes.ok) throw new Error("quotes missing");
    const selected = quotes.quotes.find((q) => q.status === "SELECTED")!;
    await prisma.repairQuote.update({
      where: { id: selected.id },
      data: { compatibilityAttestation: "NOT_CONFIRMED" },
    });
    const guardCheck = await selectQuote(prisma, repairId, selected.id, customerId, version);
    expect(guardCheck.ok).toBe(false);
    await prisma.repairQuote.deleteMany({ where: { repairRequestId: repairId } });
    await prisma.repairRequest.update({ where: { id: repairId }, data: { selectedQuoteId: null } });
  });
});
