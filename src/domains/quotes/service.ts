/**
 * Quotes domain service (S03 scope): deterministic demo quotes from three
 * SIMULATED repairers, validity windows, and CAS-guarded quote selection.
 * In Repair-versus-Replace mode there is no Channel3 part reference on quotes;
 * the replacement-device benchmark is surfaced separately for comparison.
 */

import { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { computeQuote, QUOTE_PROFILES } from "@/domains/quotes/pricing";

export const QUOTE_VALIDITY_MS = 48 * 60 * 60 * 1000; // 48 hours

export type QuoteWithRepairer = {
  id: string;
  status: string;
  version: number;
  componentLabel: string;
  compatibilityAttestation: string;
  compatibilityNotes: string;
  partChargeMinor: number;
  labourMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  warrantyDays: number | null;
  warrantyText: string;
  estimatedDurationHours: number | null;
  scopeText: string;
  exclusionsText: string;
  validUntil: string;
  expired: boolean;
  selectable: boolean;
  demoActor: true;
  repairer: { displayName: string; demoLabel: string; demoDescription: string };
};

function toQuote(row: {
  id: string;
  status: string;
  version: number;
  componentLabel: string;
  compatibilityAttestation: string;
  compatibilityNotes: string;
  partChargeMinor: number;
  labourMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  warrantyDays: number | null;
  warrantyText: string;
  estimatedDurationHours: number | null;
  scopeText: string;
  exclusionsText: string;
  validUntil: Date;
  repairer: { displayName: string; demoLabel: string; demoDescription: string };
}): QuoteWithRepairer {
  const expired = row.validUntil.getTime() <= Date.now();
  const selectable = !expired && row.status === "GENERATED" && row.compatibilityAttestation === "CONFIRMED_FOR_DEMO" && row.totalMinor > 0 && row.currency === "USD";
  return { ...row, validUntil: row.validUntil.toISOString(), expired, selectable, demoActor: true };
}

export type GenerateOutcome =
  | { ok: true; quotes: QuoteWithRepairer[] }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string };

/**
 * Generates the three demo quotes idempotently. Prerequisites: owned repair with
 * a repair category (from intake or manual selection). Values are deterministic.
 */
export async function ensureQuotes(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
): Promise<GenerateOutcome> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  if (!repair.repairCategory) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Select a repair category before requesting quotes" };
  }
  if (repair.deviceModelConfidence === "UNKNOWN") {
    return { ok: false, code: "VALIDATION_ERROR", message: "Device model is unverified — quotes require a catalog device" };
  }

  const existing = await prisma.repairQuote.findMany({
    where: { repairRequestId: repairId },
    include: { repairer: true },
    orderBy: { totalMinor: "asc" },
  });
  if (existing.length > 0) {
    return { ok: true, quotes: existing.map(toQuote) };
  }

  const repairers = await prisma.simulatedRepairer.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (repairers.length !== QUOTE_PROFILES.length) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Simulated repairer seed data is missing — run db:seed" };
  }

  const validUntil = new Date(Date.now() + QUOTE_VALIDITY_MS);
  const created = [];
  for (const [i, repairer] of repairers.entries()) {
    const computed = computeQuote(repair.repairCategory, QUOTE_PROFILES[i]);
    created.push(
      await prisma.repairQuote.create({
        data: {
          repairRequestId: repairId,
          repairerId: repairer.id,
          componentLabel: computed.componentLabel,
          compatibilityAttestation: "CONFIRMED_FOR_DEMO",
          compatibilityNotes: "Simulated attestation for the demo — not independent technical verification.",
          partChargeMinor: computed.partChargeMinor,
          labourMinor: computed.labourMinor,
          feesMinor: computed.feesMinor,
          taxMinor: computed.taxMinor,
          totalMinor: computed.totalMinor,
          currency: "USD",
          warrantyDays: computed.warrantyDays,
          warrantyText: computed.warrantyText,
          estimatedDurationHours: computed.estimatedDurationHours,
          scopeText: computed.scopeText,
          exclusionsText: computed.exclusionsText,
          validUntil,
        },
        include: { repairer: true },
      }),
    );
  }
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "SYSTEM",
    eventType: "quotes.generated",
    payload: { count: created.length },
  });
  return { ok: true, quotes: created.map(toQuote) };
}

export type SelectOutcome =
  | { ok: true; quote: QuoteWithRepairer }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR"; message: string };

export async function selectQuote(
  prisma: PrismaClient,
  repairId: string,
  quoteId: string,
  customerId: string,
  expectedRepairVersion: number,
): Promise<SelectOutcome> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  if (repair.version !== expectedRepairVersion) {
    return { ok: false, code: "CONFLICT", message: "The repair request changed — refresh and retry" };
  }
  const quote = await prisma.repairQuote.findUnique({ where: { id: quoteId }, include: { repairer: true } });
  if (!quote || quote.repairRequestId !== repairId) {
    return { ok: false, code: "NOT_FOUND", message: "Quote not found for this repair" };
  }
  if (quote.validUntil.getTime() <= Date.now()) {
    return { ok: false, code: "VALIDATION_ERROR", message: "This quote has expired" };
  }
  if (quote.compatibilityAttestation !== "CONFIRMED_FOR_DEMO" || quote.totalMinor <= 0 || quote.currency !== "USD") {
    return { ok: false, code: "VALIDATION_ERROR", message: "This quote is not selectable under the demo rules" };
  }

  // Optimistic concurrency: only one quote can move GENERATED -> SELECTED.
  const updated = await prisma.repairQuote.updateMany({
    where: { id: quoteId, status: "GENERATED" },
    data: { status: "SELECTED" },
  });
  if (updated.count !== 1) {
    return { ok: false, code: "CONFLICT", message: "This quote was already selected or superseded" };
  }
  await prisma.repairQuote.updateMany({
    where: { repairRequestId: repairId, status: "GENERATED", id: { not: quoteId } },
    data: { status: "SUPERSEDED" },
  });
  await prisma.repairRequest.update({
    where: { id: repairId, version: expectedRepairVersion },
    data: { selectedQuoteId: quoteId, version: { increment: 1 } },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "quote.selected",
    payload: { quoteId, totalMinor: quote.totalMinor },
  });
  return { ok: true, quote: toQuote({ ...quote, status: "SELECTED" }) };
}

export async function listQuotes(prisma: PrismaClient, repairId: string, customerId: string): Promise<GenerateOutcome> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  const quotes = await prisma.repairQuote.findMany({
    where: { repairRequestId: repairId },
    include: { repairer: true },
    orderBy: { totalMinor: "asc" },
  });
  return { ok: true, quotes: quotes.map(toQuote) };
}
