/**
 * Repair job + evidence domain service (S05 scope).
 * Work starts only after contract approval AND confirmed payment AUTHORIZATION.
 * Evidence is bound to the current contract version; mandatory-field completeness
 * is deterministic product law — AI adds advisory flags only and can never gate
 * or trigger payment.
 */

import { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { processUploadedImage } from "@/domains/repairs/assetService";
import { getStorage, validateUpload, type AllowedImageMime } from "@/lib/storage";
import { chatWithImage, extractJsonObject, systemPromptForEvidence } from "@/integrations/ai/client";
import { EvidenceAssessmentSchema, EVIDENCE_ASSESSMENT_SCHEMA_VERSION } from "@/domains/evidence/schema";

export type JobOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN" | "ASSET_INVALID" | "DEPENDENCY_UNAVAILABLE"; message: string };

function fail<T>(code: JobOutcome<never>["ok"] extends true ? never : "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN" | "ASSET_INVALID" | "DEPENDENCY_UNAVAILABLE", message: string): JobOutcome<T> {
  return { ok: false, code, message };
}

export { MANDATORY_CHECKS } from "@/domains/evidence/checks";
import { MANDATORY_CHECKS } from "@/domains/evidence/checks";;

export type StartedJob = {
  jobId: string;
  status: string;
  contractVersionId: string;
};

export async function startJob(
  prisma: PrismaClient,
  repairId: string,
  repairerUserId: string,
): Promise<JobOutcome<StartedJob>> {
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: { contract: true, jobs: true },
  });
  if (!repair) return fail("NOT_FOUND", "Repair request not found");
  const contract = repair.contract;
  if (!contract || contract.status !== "APPROVED") {
    return fail("VALIDATION_ERROR", "Work cannot start before the contract is approved");
  }
  const repairer = await prisma.simulatedRepairer.findUnique({ where: { userId: repairerUserId } });
  if (!repairer) return fail("FORBIDDEN", "Simulated repairer profile missing");
  const quote = await prisma.repairQuote.findUnique({ where: { id: contract.selectedQuoteId } });
  if (!quote || quote.repairerId !== repairer.id) {
    return fail("FORBIDDEN", "Only the assigned simulated repairer can start this job");
  }
  const payment = await prisma.paymentAttempt.findFirst({
    where: { repairContractId: contract.id },
    orderBy: { createdAt: "desc" },
  });
  if (!payment || payment.status !== "AUTHORIZED") {
    return fail("VALIDATION_ERROR", "Work cannot start until the payment is confirmed AUTHORIZED");
  }
  if (repair.jobs.length > 0) {
    const job = repair.jobs[0];
    if (job.status === "CANCELLED") return fail("CONFLICT", "This repair was cancelled");
    return { ok: true, result: { jobId: job.id, status: job.status, contractVersionId: job.contractVersionId } }; // idempotent
  }

  const job = await prisma.repairJob.create({
    data: {
      repairRequestId: repairId,
      contractId: contract.id,
      contractVersionId: contract.currentVersionId!,
      repairerId: repairer.id,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairJob",
    aggregateId: job.id,
    actorType: "SIMULATED_REPAIRER",
    actorId: repairerUserId,
    eventType: "job.started",
    payload: { contractVersionId: job.contractVersionId },
  });
  return { ok: true, result: { jobId: job.id, status: job.status, contractVersionId: job.contractVersionId } };
}

export type SubmitEvidenceInput = {
  contractVersionId: string;
  componentDeclaration: string;
  componentIdentityBasis: "LABEL_PHOTO" | "TECHNICIAN_DECLARATION" | "OTHER";
  functionalChecks: Array<{ check: string; result: "PASS" | "FAIL" }>;
  afterAssetIds: string[];
  componentAssetIds: string[];
  notes?: string;
};

export type SubmittedEvidence = {
  submissionId: string;
  jobId: string;
  status: "SUBMITTED";
  completeness: "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE";
  advisoryFlags: Array<{ code: string; severity: string; message: string }>;
};

/** Deterministic mandatory-field rules — these block submission, AI never does. */
export function evidenceViolations(
  input: SubmitEvidenceInput & { functionalChecksCategory?: string },
  hasIntakePhotos: boolean,
): string[] {
  const violations: string[] = [];
  if (!hasIntakePhotos) violations.push("No before photo exists — the intake must include at least one photo");
  if (input.afterAssetIds.length === 0) violations.push("At least one after-repair photo is required");
  if (input.componentDeclaration.trim().length < 5) violations.push("Component declaration is required");
  if (input.componentIdentityBasis === "LABEL_PHOTO" && input.componentAssetIds.length === 0) {
    violations.push("Label photo basis selected but no component label photo was provided");
  }
  const required = MANDATORY_CHECKS[input.functionalChecksCategory ?? "OTHER"] ?? MANDATORY_CHECKS.OTHER;
  for (const check of required) {
    const found = input.functionalChecks.find((c) => c.check === check);
    if (!found) violations.push(`Missing mandatory functional check: ${check}`);
    else if (found.result !== "PASS" && found.result !== "FAIL") violations.push(`Check ${check} must record PASS or FAIL`);
  }
  const known = new Set(input.functionalChecks.map((c) => c.check));
  if (input.functionalChecks.length !== known.size) violations.push("Duplicate functional checks are not allowed");
  return violations;
}

export async function submitEvidence(
  prisma: PrismaClient,
  repairId: string,
  repairerUserId: string,
  rawInput: SubmitEvidenceInput & { functionalChecksCategory?: string },
): Promise<JobOutcome<SubmittedEvidence>> {
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: { jobs: { include: { submissions: { where: { status: "SUBMITTED" } } } } },
  });
  if (!repair) return fail("NOT_FOUND", "Repair request not found");
  const job = repair.jobs[0];
  if (!job || job.repairerId !== (await prisma.simulatedRepairer.findUnique({ where: { userId: repairerUserId } }))?.id) {
    return fail("FORBIDDEN", "Only the assigned simulated repairer can submit evidence");
  }
  if (job.contractVersionId !== rawInput.contractVersionId) {
    return fail("CONFLICT", "The contract changed — evidence must reference the current contract version");
  }
  if (job.status !== "IN_PROGRESS" && job.status !== "REWORK_IN_PROGRESS" && job.status !== "AWAITING_EVIDENCE") {
    return fail("CONFLICT", `Job is ${job.status} — evidence cannot be submitted now`);
  }
  if (job.submissions.length > 0) {
    return fail("CONFLICT", "Evidence was already submitted and awaits the customer decision");
  }

  const input = { ...rawInput, functionalChecksCategory: repair.repairCategory ?? "OTHER" };
  const intakeCount = await prisma.uploadedAsset.count({ where: { repairRequestId: repairId, assetKind: "INTAKE", deletedAt: null } });
  const violations = evidenceViolations(input, intakeCount > 0);
  if (violations.length > 0) {
    return fail("VALIDATION_ERROR", `Evidence incomplete: ${violations.join("; ")}`);
  }

  // Uploaded evidence assets must exist, belong to this repairer, and be unreferenced.
  const claimedIds = [...input.afterAssetIds, ...input.componentAssetIds];
  for (const assetId of claimedIds) {
    const asset = await prisma.uploadedAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt || asset.repairRequestId !== repairId) {
      return fail("VALIDATION_ERROR", "Evidence asset not found for this repair");
    }
  }

  const submission = await prisma.evidenceSubmission.create({
    data: {
      repairJobId: job.id,
      contractVersionId: input.contractVersionId,
      submittedBy: repairerUserId,
      status: "SUBMITTED",
      componentDeclaration: input.componentDeclaration.trim(),
      componentIdentityBasis: input.componentIdentityBasis,
      functionalChecksJson: input.functionalChecks,
      notes: input.notes?.trim() || null,
      submittedAt: new Date(),
    },
  });
  const assetRows = [
    ...input.afterAssetIds.map((id) => ({ uploadedAssetId: id, evidenceType: "AFTER" as const })),
    ...input.componentAssetIds.map((id) => ({ uploadedAssetId: id, evidenceType: "COMPONENT_LABEL" as const })),
  ];
  for (const row of assetRows) {
    await prisma.evidenceAsset.create({ data: { submissionId: submission.id, uploadedAssetId: row.uploadedAssetId, evidenceType: row.evidenceType } });
  }
  await prisma.repairJob.update({ where: { id: job.id }, data: { status: "CUSTOMER_REVIEW", evidenceSubmittedAt: new Date() } });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "EVIDENCE_SUBMITTED" } });
  await writeAudit(prisma, {
    aggregateType: "EvidenceSubmission",
    aggregateId: submission.id,
    actorType: "SIMULATED_REPAIRER",
    actorId: repairerUserId,
    eventType: "evidence.submitted",
    payload: { jobId: job.id, afterImages: input.afterAssetIds.length, componentImages: input.componentAssetIds.length },
  });

  // Advisory AI assessment — never gates the submission or touches payment.
  const assessment = await assessEvidence(prisma, submission.id, repairId, input);
  return {
    ok: true,
    result: {
      submissionId: submission.id,
      jobId: job.id,
      status: "SUBMITTED",
      completeness: assessment.completeness,
      advisoryFlags: assessment.flags,
    },
  };
}

type AssessmentResult = { completeness: "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE"; flags: Array<{ code: string; severity: string; message: string }> };

async function assessEvidence(
  prisma: PrismaClient,
  submissionId: string,
  repairId: string,
  input: SubmitEvidenceInput,
): Promise<AssessmentResult> {
  let model = "none";
  try {
    const env = getServerEnv();
    model = env.AI_MODEL ?? "none";
    const result = await chatWithImage({
      system: systemPromptForEvidence(),
      userText: [
        "Assess the completeness/consistency of this repair evidence submission (advisory only).",
        `Component declaration: "${input.componentDeclaration}"`,
        `Identity basis: ${input.componentIdentityBasis}`,
        `Functional checks: ${JSON.stringify(input.functionalChecks)}`,
        `After photos provided: ${input.afterAssetIds.length}; component label photos: ${input.componentAssetIds.length}.`,
        "Return only the JSON object per instructions.",
      ].join("\n"),
      images: [],
    });
    if (!result.ok) throw new Error(result.error);
    const parsed = EvidenceAssessmentSchema.safeParse(extractJsonObject({ content: result.content, reasoning_content: result.reasoningContent }));
    const value = parsed.success
      ? { completeness: parsed.data.completeness, flags: [...parsed.data.flags, ...parsed.data.consistencyObservations.map((o) => ({ code: o.code, severity: o.severity, message: o.message }))] }
      : { completeness: "UNAVAILABLE" as const, flags: [] };
    await prisma.evidenceAssessment.create({
      data: {
        submissionId,
        provider: "openai-compatible",
        model,
        schemaVersion: EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
        completeness: value.completeness,
        flags: value.flags,
        reasoningSummary: parsed.success ? "Advisory AI review completed." : "AI output failed validation — treated as unavailable.",
      },
    });
    return value;
  } catch {
    // AI unavailable: record UNAVAILABLE; the customer can still decide.
    await prisma.evidenceAssessment.create({
      data: {
        submissionId,
        provider: "openai-compatible",
        model,
        schemaVersion: EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
        completeness: "UNAVAILABLE",
        flags: [],
        reasoningSummary: "AI check unavailable — deterministic checks passed; the customer decides without AI input.",
      },
    });
    return { completeness: "UNAVAILABLE", flags: [] };
  }
}

export type UploadedEvidence = { assetId: string; width: number; height: number };

export async function addEvidenceAsset(
  prisma: PrismaClient,
  repairId: string,
  repairerUserId: string,
  file: File,
  kind: "AFTER" | "COMPONENT_LABEL",
): Promise<JobOutcome<UploadedEvidence>> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { jobs: true, contract: true } });
  if (!repair) return fail("NOT_FOUND", "Repair request not found");
  const repairer = await prisma.simulatedRepairer.findUnique({ where: { userId: repairerUserId } });
  const job = repair.jobs[0];
  if (!job || !repairer || job.repairerId !== repairer.id) {
    return fail("FORBIDDEN", "Only the assigned simulated repairer can upload evidence");
  }
  if (job.status !== "IN_PROGRESS" && job.status !== "REWORK_IN_PROGRESS" && job.status !== "AWAITING_EVIDENCE") {
    return fail("CONFLICT", "Evidence uploads are closed for this job");
  }
  const sizeCheck = validateUpload({ byteSize: file.size, mimeType: file.type || "application/octet-stream" });
  if (!sizeCheck.ok) return fail("ASSET_INVALID", sizeCheck.reason);
  const processed = await processUploadedImage(file);
  if ("error" in processed) return fail("ASSET_INVALID", processed.error);
  const postCheck = validateUpload({ byteSize: processed.buffer.byteLength, mimeType: processed.mimeType });
  if (!postCheck.ok) return fail("ASSET_INVALID", postCheck.reason);
  const stored = await getStorage().put(processed.buffer, processed.mimeType as AllowedImageMime);
  const asset = await prisma.uploadedAsset.create({
    data: {
      repairRequestId: repairId,
      ownerId: repairerUserId,
      assetKind: kind === "AFTER" ? "AFTER" : "COMPONENT",
      storageKey: stored.storageKey,
      mimeType: processed.mimeType,
      byteSize: processed.buffer.byteLength,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
    },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "SIMULATED_REPAIRER",
    actorId: repairerUserId,
    eventType: "evidence.asset_uploaded",
    payload: { assetId: asset.id, kind },
  });
  return { ok: true, result: { assetId: asset.id, width: processed.width, height: processed.height } };
}
