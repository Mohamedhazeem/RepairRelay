/**
 * Repair Passport read model (S06 scope). A passport exists only after the
 * accepted repair AND a confirmed capture — before that, callers receive a
 * status summary with passportAvailable: false. Read-only; historical labels
 * are explicit; no provider secrets are ever included.
 */

import { PrismaClient } from "@prisma/client";
import { termsFromVersion } from "@/domains/contracts/service";

export type PassportView = {
  publicReference: string;
  device: { brand: string; model: string };
  completedAt: string | null;
  diagnosis: {
    likelyRepairCategory: string | null;
    confidenceBand: string;
    visibleObservations: Array<{ observation: string; certainty: string }>;
    caveat: string;
  } | null;
  contract: {
    contractId: string;
    currentVersionNumber: number;
    totalMinor: number;
    currency: string;
    terms: ReturnType<typeof termsFromVersion>;
    history: Array<{ versionNumber: number; totalMinor: number; changeReason: string | null; approvedAt: string | null }>;
  };
  productReference: {
    title: string;
    channel3ProductId: string;
    priceMinor: number;
    currency: string;
    domain: string;
    observedAt: string;
    label: string;
  } | null;
  repairer: {
    displayName: string;
    demoLabel: string;
    componentDeclaration: string;
    componentIdentityBasis: string;
    note: string;
  };
  evidence: Array<{ assetId: string; evidenceType: string; available: boolean }>;
  functionalChecks: Array<{ check: string; result: string }>;
  payment: {
    captureId: string;
    authorizationId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    capturedAt: string;
  };
  timeline: Array<{ at: string; actorType: string; eventType: string; label: string }>;
};

export type PassportOutcome =
  | { ok: true; passportAvailable: false; reason: string; repairStatus: string }
  | { ok: true; passportAvailable: true; passport: PassportView }
  | { ok: false; code: "NOT_FOUND"; message: string };

const EVENT_LABELS: Record<string, string> = {
  "repair_request.created": "Repair request created",
  "repair_request.asset_uploaded": "Intake photo uploaded",
  "diagnosis.completed": "AI assessment completed",
  "product_search.performed": "Replacement-device search performed",
  "product_selected": "Replacement-device comparison reference selected",
  "quotes.generated": "Simulated repairer quotes generated",
  "quote.selected": "Quote selected",
  "contract.created": "Repair contract drafted",
  "contract.approved": "Repair contract approved",
  "contract.change_requested": "Contract change requested",
  "contract.change_approved": "Contract change approved",
  "contract.change_rejected": "Contract change rejected",
  "payment.order_created": "PayPal order created",
  "payment.buyer_cancelled": "Buyer cancelled approval",
  "payment.authorized": "Payment authorized",
  "payment.reconciled": "Payment state reconciled",
  "job.started": "Repair started",
  "evidence.asset_uploaded": "Evidence photo uploaded",
  "evidence.submitted": "Completion evidence submitted",
  "decision.rework_requested": "Rework requested",
  "decision.accepted": "Repair accepted by customer",
  "decision.cancel_requested": "Cancellation requested",
  "decision.cancelled": "Repair cancelled",
  "payment.capture_pending": "Capture pending",
  "payment.captured": "Payment captured",
  "payment.voided": "Authorization voided",
};

export async function getPassport(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
): Promise<PassportOutcome> {
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: {
      contract: {
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
          paymentAttempts: { orderBy: { createdAt: "desc" } },
        },
      },
      diagnosisReports: { orderBy: { createdAt: "desc" }, take: 1 },
      jobs: {
        include: {
          submissions: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true, assessments: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
      },
    },
  });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  const contract = repair.contract;
  const job = repair.jobs[0];
  const capture = contract?.paymentAttempts.find((a) => a.status === "CAPTURED" && a.paypalCaptureId);

  // Gate: accepted repair + confirmed capture only.
  if (!contract || !job || job.status !== "ACCEPTED" || repair.status !== "COMPLETED" || !capture) {
    return {
      ok: true,
      passportAvailable: false,
      reason: !contract
        ? "No contract exists yet"
        : !capture
          ? "The passport is issued only after the repair is accepted and the payment capture is confirmed"
          : "The repair is not fully accepted yet",
      repairStatus: repair.status,
    };
  }

  const submission = job.submissions[0] ?? null;
  const currentVersion = contract.versions.find((v) => v.id === contract.currentVersionId) ?? contract.versions[0];
  const terms = termsFromVersion(currentVersion);
  const diagnosis = repair.diagnosisReports[0] ?? null;

  // Evidence availability: mark assets whose stored content is missing rather than failing the passport.
  const storage = await import("@/lib/storage").then((m) => m.getStorage());
  const evidence: PassportView["evidence"] = [];
  if (submission) {
    for (const asset of submission.assets) {
      let available = true;
      try {
        await storage.get(asset.uploadedAssetId ? (await prisma.uploadedAsset.findUniqueOrThrow({ where: { id: asset.uploadedAssetId } })).storageKey : "");
      } catch {
        available = false;
      }
      evidence.push({ assetId: asset.uploadedAssetId, evidenceType: asset.evidenceType, available });
    }
  }

  // Chronological audit timeline across the aggregates of this repair.
  const aggregateIds = [repair.id, contract.id, job.id, capture.id, ...(submission ? [submission.id] : [])];
  const events = await prisma.auditEvent.findMany({
    where: { aggregateId: { in: aggregateIds } },
    orderBy: { createdAt: "asc" },
  });
  const timeline = events
    .map((e) => ({
      at: e.createdAt.toISOString(),
      actorType: e.actorType,
      eventType: e.eventType,
      label: EVENT_LABELS[e.eventType] ?? e.eventType.replaceAll("_", " "),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const productRef = terms.productReference;

  return {
    ok: true,
    passportAvailable: true,
    passport: {
      publicReference: repair.publicReference,
      device: { brand: repair.deviceBrand, model: repair.deviceModel },
      completedAt: capture.updatedAt.toISOString(),
      diagnosis: diagnosis
        ? {
            likelyRepairCategory: diagnosis.likelyRepairCategory,
            confidenceBand: diagnosis.confidenceBand,
            visibleObservations: (diagnosis.visibleObservations as Array<{ observation: string; certainty: string }>) ?? [],
            caveat: "The original AI assessment was advisory visual triage — physical inspection governed the actual repair.",
          }
        : null,
      contract: {
        contractId: contract.id,
        currentVersionNumber: currentVersion.versionNumber,
        totalMinor: contract.totalMinor,
        currency: contract.currency,
        terms,
        history: contract.versions.map((v) => ({
          versionNumber: v.versionNumber,
          totalMinor: v.totalMinor,
          changeReason: v.changeReason,
          approvedAt: v.customerApprovedAt?.toISOString() ?? null,
        })),
      },
      productReference: productRef
        ? {
            title: productRef.title,
            channel3ProductId: productRef.channel3ProductId,
            priceMinor: productRef.priceMinor,
            currency: productRef.currency,
            domain: productRef.domain,
            observedAt: productRef.observedAt,
            label: `Historical replacement-device comparison observed ${new Date(productRef.observedAt).toLocaleString("en-US")} — not a current offer and not a repair part`,
          }
        : null,
      repairer: {
        displayName: terms.quote.repairerDisplayName,
        demoLabel: "SIMULATED",
        componentDeclaration: submission?.componentDeclaration ?? "—",
        componentIdentityBasis:
          submission?.componentIdentityBasis === "TECHNICIAN_DECLARATION"
            ? "Technician declaration (not photo-verified)"
            : (submission?.componentIdentityBasis ?? "—").replaceAll("_", " ").toLowerCase(),
        note: submission?.notes ?? "",
      },
      evidence,
      functionalChecks: (submission?.functionalChecksJson as Array<{ check: string; result: string }>) ?? [],
      payment: {
        captureId: capture.paypalCaptureId!,
        authorizationId: capture.paypalAuthorizationId ?? "",
        amountMinor: capture.amountMinor,
        currency: capture.currency,
        provider: "PayPal (sandbox)",
        capturedAt: capture.updatedAt.toISOString(),
      },
      timeline,
    },
  };
}
