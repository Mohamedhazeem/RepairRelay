/**
 * Repair Contract domain service (S03 scope).
 * Immutable versioned contracts: the selected quote is frozen into a snapshot,
 * approval is an explicit customer action with optimistic version checks, and
 * material changes go through formal change requests with server-computed
 * before/after diffs. AI never calculates amounts; it may only explain a
 * precomputed diff (explanation UI is optional and rendered from this data).
 * S03 never calls PayPal — amount changes with an existing authorization are
 * blocked here and handled by the S04 payment orchestrator.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { sumMinor } from "@/lib/money";
import { isObservationFresh } from "@/domains/products/service";

export type QuoteSnapshot = {
  quoteId: string;
  repairerId: string;
  repairerDisplayName: string;
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
};

export type ProductReferenceSnapshot = {
  kind: "REPLACEMENT_DEVICE_COMPARISON";
  channel3ProductId: string;
  title: string;
  domain: string;
  priceMinor: number;
  currency: string;
  observedAt: string;
  note: string;
};

export type ContractTerms = {
  versionNumber: number;
  totalMinor: number;
  currency: string;
  quote: QuoteSnapshot;
  productReference: ProductReferenceSnapshot | null;
  scopeText: string;
  warrantyText: string;
  changeReason: string | null;
  customerApprovedAt: string | null;
  createdAt: string;
};

function snapshotFromQuote(quote: {
  id: string;
  repairerId: string;
  repairer: { displayName: string };
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
}): QuoteSnapshot {
  return {
    quoteId: quote.id,
    repairerId: quote.repairerId,
    repairerDisplayName: quote.repairer.displayName,
    componentLabel: quote.componentLabel,
    compatibilityAttestation: quote.compatibilityAttestation,
    compatibilityNotes: quote.compatibilityNotes,
    partChargeMinor: quote.partChargeMinor,
    labourMinor: quote.labourMinor,
    feesMinor: quote.feesMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
    currency: quote.currency,
    warrantyDays: quote.warrantyDays,
    warrantyText: quote.warrantyText,
    estimatedDurationHours: quote.estimatedDurationHours,
    scopeText: quote.scopeText,
    exclusionsText: quote.exclusionsText,
  };
}

export type CreateContractOutcome =
  | { ok: true; contractId: string; status: string; version: number; totalMinor: number }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT"; message: string };

/** Freezes the selected quote into contract version 1 (AWAITING_CUSTOMER_APPROVAL). Idempotent. */
export async function createContractFromSelection(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
): Promise<CreateContractOutcome> {
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: { contract: true },
  });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  if (repair.contract) {
    return { ok: true, contractId: repair.contract.id, status: repair.contract.status, version: repair.contract.version, totalMinor: repair.contract.totalMinor };
  }
  if (!repair.selectedQuoteId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Select a quote before creating the contract" };
  }
  const quote = await prisma.repairQuote.findUnique({ where: { id: repair.selectedQuoteId }, include: { repairer: true } });
  if (!quote || quote.repairRequestId !== repairId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Selected quote not found" };
  }
  if (quote.status !== "SELECTED") {
    return { ok: false, code: "VALIDATION_ERROR", message: "The selected quote is no longer active" };
  }
  if (quote.validUntil.getTime() <= Date.now()) {
    return { ok: false, code: "VALIDATION_ERROR", message: "The selected quote has expired — request new quotes" };
  }

  const quoteSnapshot = snapshotFromQuote(quote);

  // Historical replacement-device comparison snapshot (if the customer picked one).
  let productReference: ProductReferenceSnapshot | null = null;
  if (repair.selectedCandidateId && repair.selectedChannel3ProductId) {
    const candidate = await prisma.productCandidate.findUnique({
      where: { id: repair.selectedCandidateId },
      include: { offerObservations: { orderBy: { observedAt: "desc" }, take: 1 } },
    });
    const obs = candidate?.offerObservations[0];
    if (candidate && obs && obs.priceMinor !== null) {
      productReference = {
        kind: "REPLACEMENT_DEVICE_COMPARISON",
        channel3ProductId: repair.selectedChannel3ProductId,
        title: candidate.title,
        domain: obs.domain,
        priceMinor: obs.priceMinor,
        currency: obs.currency ?? "USD",
        observedAt: obs.observedAt.toISOString(),
        note: isObservationFresh(obs)
          ? "Replacement-device comparison observed during this session — historical record, not a current offer or a repair part."
          : "Replacement-device comparison observed earlier — historical record, not a current offer or a repair part.",
      };
    }
  }

  const contract = await prisma.repairContract.create({
    data: {
      repairRequestId: repairId,
      selectedQuoteId: quote.id,
      status: "AWAITING_CUSTOMER_APPROVAL",
      version: 1,
      currency: quote.currency,
      totalMinor: quote.totalMinor,
      versions: {
        create: {
          versionNumber: 1,
          quoteSnapshotJson: quoteSnapshot,
          productReferenceSnapshotJson: productReference ?? Prisma.JsonNull,
          scopeSnapshot: quote.scopeText,
          warrantySnapshot: quote.warrantyText,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
          createdBy: customerId,
        },
      },
    },
    include: { versions: true },
  });
  const version1 = contract.versions.find((v) => v.versionNumber === 1)!;
  await prisma.repairContract.update({ where: { id: contract.id }, data: { currentVersionId: version1.id } });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "CONTRACT_SELECTED" } });
  await writeAudit(prisma, {
    aggregateType: "RepairContract",
    aggregateId: contract.id,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "contract.created",
    payload: { totalMinor: contract.totalMinor, versionNumber: 1 },
  });
  return { ok: true, contractId: contract.id, status: contract.status, version: contract.version, totalMinor: contract.totalMinor };
}

type VersionRow = {
  id: string;
  versionNumber: number;
  quoteSnapshotJson: unknown;
  productReferenceSnapshotJson: unknown;
  scopeSnapshot: string;
  warrantySnapshot: string;
  totalMinor: number;
  currency: string;
  changeReason: string | null;
  customerApprovedAt: Date | null;
  createdAt: Date;
};

export function termsFromVersion(v: VersionRow): ContractTerms {
  return {
    versionNumber: v.versionNumber,
    totalMinor: v.totalMinor,
    currency: v.currency,
    quote: v.quoteSnapshotJson as QuoteSnapshot,
    productReference: (v.productReferenceSnapshotJson as ProductReferenceSnapshot | null) ?? null,
    scopeText: v.scopeSnapshot,
    warrantyText: v.warrantySnapshot,
    changeReason: v.changeReason,
    customerApprovedAt: v.customerApprovedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export type ApproveOutcome =
  | { ok: true; status: "APPROVED"; version: number; totalMinor: number }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT"; message: string };

export async function approveContract(
  prisma: PrismaClient,
  contractId: string,
  customerId: string,
  input: { expectedContractVersion: number; confirmed: boolean },
): Promise<ApproveOutcome> {
  const contract = await prisma.repairContract.findUnique({ where: { id: contractId }, include: { repairRequest: true } });
  if (!contract || contract.repairRequest.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Contract not found" };
  }
  if (!input.confirmed) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Explicit confirmation is required to approve the contract" };
  }
  if (contract.status !== "AWAITING_CUSTOMER_APPROVAL") {
    return { ok: false, code: "CONFLICT", message: `Contract is ${contract.status.toLowerCase().replaceAll("_", " ")} — approval not possible now` };
  }
  if (contract.version !== input.expectedContractVersion) {
    return { ok: false, code: "CONFLICT", message: "The contract changed — refresh and review the latest version" };
  }
  // Quote must still be valid at approval time.
  const quote = await prisma.repairQuote.findUnique({ where: { id: contract.selectedQuoteId } });
  if (!quote || quote.validUntil.getTime() <= Date.now()) {
    return { ok: false, code: "VALIDATION_ERROR", message: "The underlying quote has expired — request new quotes" };
  }

  const now = new Date();
  const cas = await prisma.repairContract.updateMany({
    where: { id: contractId, version: input.expectedContractVersion, status: "AWAITING_CUSTOMER_APPROVAL" },
    data: { status: "APPROVED", approvedAt: now, version: { increment: 1 } },
  });
  if (cas.count !== 1) {
    return { ok: false, code: "CONFLICT", message: "Concurrent update — the contract was already approved or changed" };
  }
  if (contract.currentVersionId) {
    await prisma.contractVersion.update({
      where: { id: contract.currentVersionId },
      data: { customerApprovedAt: now },
    });
  }
  await prisma.repairRequest.update({ where: { id: contract.repairRequestId }, data: { status: "CONTRACT_APPROVED" } });
  await writeAudit(prisma, {
    aggregateType: "RepairContract",
    aggregateId: contractId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "contract.approved",
    payload: { versionNumber: contract.version, totalMinor: contract.totalMinor },
  });
  return { ok: true, status: "APPROVED", version: contract.version + 1, totalMinor: contract.totalMinor };
}

export type ProposedChanges = {
  componentLabel?: string;
  partChargeMinor?: number;
  labourMinor?: number;
  feesMinor?: number;
  taxMinor?: number;
  warrantyDays?: number;
  estimatedDurationHours?: number;
  scopeText?: string;
  exclusionsText?: string;
};

export type ChangeRequestOutcome =
  | { ok: true; changeRequestId: string; before: ContractTerms; after: { totalMinor: number; changes: Record<string, { before: unknown; after: unknown }> } }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN"; message: string };

/** Simulated repairer proposes a formal change; server computes the deterministic before/after. */
export async function createChangeRequest(
  prisma: PrismaClient,
  contractId: string,
  repairerUserId: string,
  input: { expectedContractVersion: number; reason: string; proposedChanges: ProposedChanges },
): Promise<ChangeRequestOutcome> {
  const contract = await prisma.repairContract.findUnique({
    where: { id: contractId },
    include: { repairRequest: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!contract) return { ok: false, code: "NOT_FOUND", message: "Contract not found" };
  if (contract.repairRequest.customerId === repairerUserId) {
    return { ok: false, code: "FORBIDDEN", message: "Customers decide on contracts; repairers propose changes" };
  }
  const repairer = await prisma.simulatedRepairer.findUnique({ where: { userId: repairerUserId } });
  const currentTerms = termsFromVersion(contract.versions[0]);
  if (!repairer || repairer.id !== currentTerms.quote.repairerId) {
    return { ok: false, code: "FORBIDDEN", message: "Only the assigned simulated repairer can propose changes" };
  }
  if (contract.status !== "APPROVED") {
    return { ok: false, code: "CONFLICT", message: "Changes can be proposed only while the contract is approved" };
  }
  if (contract.version !== input.expectedContractVersion) {
    return { ok: false, code: "CONFLICT", message: "The contract changed — refresh and retry" };
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1000) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Provide a reason (10–1000 characters)" };
  }
  const proposed = input.proposedChanges ?? {};
  if (Object.keys(proposed).length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "At least one change is required" };
  }
  const numeric = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (proposed.partChargeMinor !== undefined && !numeric(proposed.partChargeMinor)) return { ok: false, code: "VALIDATION_ERROR", message: "partChargeMinor must be a non-negative integer" };
  if (proposed.labourMinor !== undefined && !numeric(proposed.labourMinor)) return { ok: false, code: "VALIDATION_ERROR", message: "labourMinor must be a non-negative integer" };
  if (proposed.feesMinor !== undefined && !numeric(proposed.feesMinor)) return { ok: false, code: "VALIDATION_ERROR", message: "feesMinor must be a non-negative integer" };
  if (proposed.taxMinor !== undefined && !numeric(proposed.taxMinor)) return { ok: false, code: "VALIDATION_ERROR", message: "taxMinor must be a non-negative integer" };

  const before = currentTerms.quote;
  const afterQuote: QuoteSnapshot = {
    ...before,
    componentLabel: proposed.componentLabel ?? before.componentLabel,
    partChargeMinor: proposed.partChargeMinor ?? before.partChargeMinor,
    labourMinor: proposed.labourMinor ?? before.labourMinor,
    feesMinor: proposed.feesMinor ?? before.feesMinor,
    taxMinor: proposed.taxMinor ?? before.taxMinor,
    warrantyDays: proposed.warrantyDays ?? before.warrantyDays,
    warrantyText: proposed.warrantyDays ? `${proposed.warrantyDays}-day workmanship warranty (simulated demo terms)` : before.warrantyText,
    estimatedDurationHours: proposed.estimatedDurationHours ?? before.estimatedDurationHours,
    scopeText: proposed.scopeText ?? before.scopeText,
    exclusionsText: proposed.exclusionsText ?? before.exclusionsText,
  };
  afterQuote.totalMinor = sumMinor([afterQuote.partChargeMinor, afterQuote.labourMinor, afterQuote.feesMinor, afterQuote.taxMinor]);

  // Deterministic before/after diff.
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const keys: Array<keyof QuoteSnapshot> = ["componentLabel", "partChargeMinor", "labourMinor", "feesMinor", "taxMinor", "warrantyDays", "estimatedDurationHours", "scopeText", "exclusionsText"];
  for (const key of keys) {
    if (afterQuote[key] !== before[key]) changes[key] = { before: before[key], after: afterQuote[key] };
  }
  if (Object.keys(changes).length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Proposed values are identical to the current contract" };
  }

  const nextVersionNumber = contract.versions[0].versionNumber + 1;
  const proposedVersion = await prisma.contractVersion.create({
    data: {
      contractId: contract.id,
      versionNumber: nextVersionNumber,
      quoteSnapshotJson: afterQuote,
      productReferenceSnapshotJson: (contract.versions[0].productReferenceSnapshotJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      scopeSnapshot: afterQuote.scopeText,
      warrantySnapshot: afterQuote.warrantyText,
      totalMinor: afterQuote.totalMinor,
      currency: afterQuote.currency,
      changeReason: reason,
      createdBy: repairerUserId,
    },
  });
  const cr = await prisma.contractChangeRequest.create({
    data: {
      contractId: contract.id,
      fromVersionId: contract.versions[0].id,
      proposedVersionId: proposedVersion.id,
      requestedBy: repairerUserId,
      requestedByRole: "SIMULATED_REPAIRER",
      reason,
    },
  });
  const cas = await prisma.repairContract.updateMany({
    where: { id: contract.id, version: input.expectedContractVersion, status: "APPROVED" },
    data: { status: "CHANGE_REQUESTED", version: { increment: 1 } },
  });
  if (cas.count !== 1) {
    // Roll the proposal back rather than leaving a dangling PENDING request.
    await prisma.contractChangeRequest.delete({ where: { id: cr.id } });
    await prisma.contractVersion.delete({ where: { id: proposedVersion.id } });
    return { ok: false, code: "CONFLICT", message: "The contract changed concurrently — retry" };
  }
  await writeAudit(prisma, {
    aggregateType: "RepairContract",
    aggregateId: contract.id,
    actorType: "SIMULATED_REPAIRER",
    actorId: repairerUserId,
    eventType: "contract.change_requested",
    payload: { changeRequestId: cr.id, totalChanged: afterQuote.totalMinor !== before.totalMinor, newTotalMinor: afterQuote.totalMinor },
  });
  return { ok: true, changeRequestId: cr.id, before: currentTerms, after: { totalMinor: afterQuote.totalMinor, changes } };
}

export type DecisionOutcome =
  | { ok: true; decision: "APPROVED" | "REJECTED"; contractStatus: string; currentVersionNumber: number; totalMinor: number; amountChanged: boolean }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT"; message: string };

export async function decideChangeRequest(
  prisma: PrismaClient,
  changeRequestId: string,
  customerId: string,
  input: { decision: "APPROVE" | "REJECT"; expectedContractVersion: number },
): Promise<DecisionOutcome> {
  const cr = await prisma.contractChangeRequest.findUnique({
    where: { id: changeRequestId },
    include: { contract: { include: { repairRequest: true } } },
  });
  if (!cr || cr.contract.repairRequest.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Change request not found" };
  }
  if (cr.status !== "PENDING") {
    return { ok: false, code: "CONFLICT", message: "This change request was already decided" };
  }
  if (cr.contract.version !== input.expectedContractVersion) {
    return { ok: false, code: "CONFLICT", message: "The contract changed — refresh and review" };
  }
  const proposedVersion = await prisma.contractVersion.findUnique({ where: { id: cr.proposedVersionId } });
  if (!proposedVersion) return { ok: false, code: "NOT_FOUND", message: "Proposed version missing" };

  const now = new Date();
  const currentTotal = cr.contract.totalMinor;
  const amountChanged = proposedVersion.totalMinor !== currentTotal;

  if (input.decision === "APPROVE") {
    const cas = await prisma.repairContract.updateMany({
      where: { id: cr.contractId, version: input.expectedContractVersion, status: "CHANGE_REQUESTED" },
      data: {
        status: "APPROVED",
        totalMinor: proposedVersion.totalMinor,
        currency: proposedVersion.currency,
        currentVersionId: proposedVersion.id,
        version: { increment: 1 },
      },
    });
    if (cas.count !== 1) return { ok: false, code: "CONFLICT", message: "Concurrent decision — refresh and retry" };
    await prisma.contractVersion.update({
      where: { id: proposedVersion.id },
      data: { customerApprovedAt: now, supersededAt: null },
    });
    await prisma.contractVersion.updateMany({
      where: { contractId: cr.contractId, id: { not: proposedVersion.id }, supersededAt: null, versionNumber: { lt: proposedVersion.versionNumber } },
      data: { supersededAt: now },
    });
    await prisma.contractChangeRequest.update({ where: { id: cr.id }, data: { status: "APPROVED", customerDecisionAt: now } });
    await writeAudit(prisma, {
      aggregateType: "RepairContract",
      aggregateId: cr.contractId,
      actorType: "CUSTOMER",
      actorId: customerId,
      eventType: "contract.change_approved",
      payload: { changeRequestId: cr.id, newVersionNumber: proposedVersion.versionNumber, amountChanged },
    });
    return { ok: true, decision: "APPROVED", contractStatus: "APPROVED", currentVersionNumber: proposedVersion.versionNumber, totalMinor: proposedVersion.totalMinor, amountChanged };
  }

  // REJECT: prior approved version remains in force.
  const fromVersion = await prisma.contractVersion.findUnique({ where: { id: cr.fromVersionId } });
  const cas = await prisma.repairContract.updateMany({
    where: { id: cr.contractId, version: input.expectedContractVersion, status: "CHANGE_REQUESTED" },
    data: { status: "APPROVED", version: { increment: 1 } },
  });
  if (cas.count !== 1) return { ok: false, code: "CONFLICT", message: "Concurrent decision — refresh and retry" };
  await prisma.contractVersion.update({ where: { id: proposedVersion.id }, data: { supersededAt: now } });
  await prisma.contractChangeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", customerDecisionAt: now } });
  await writeAudit(prisma, {
    aggregateType: "RepairContract",
    aggregateId: cr.contractId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "contract.change_rejected",
    payload: { changeRequestId: cr.id },
  });
  return {
    ok: true,
    decision: "REJECTED",
    contractStatus: "APPROVED",
    currentVersionNumber: fromVersion?.versionNumber ?? 0,
    totalMinor: currentTotal,
    amountChanged: false,
  };
}
