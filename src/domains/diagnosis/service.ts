/**
 * Diagnosis application service (S01 scope): orchestrates the AI adapter, validates
 * the untrusted model output against the strict schema, persists an immutable report
 * and emits audit events. AI failure never destroys the draft and never touches payments.
 */

import { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { chatWithImage, extractJsonObject, systemPromptForDiagnosis } from "@/integrations/ai/client";
import { DiagnosisReportSchema, DIAGNOSIS_SCHEMA_VERSION, diagnosisStatusFor } from "@/domains/diagnosis/schema";
import { getStorage } from "@/lib/storage";

export type RunDiagnosisResult =
  | {
      ok: true;
      status: "DIAGNOSIS_READY" | "DIAGNOSIS_INCONCLUSIVE";
      reportId: string;
      diagnosis: unknown; // validated DiagnosisReport (client-rendered behind panels)
    }
  | { ok: false; code: "DEPENDENCY_UNAVAILABLE" | "NOT_FOUND" | "VALIDATION_ERROR"; message: string };

const diagnosisLimiter = { maxPerMinute: 6 };
const recentRuns = new Map<string, number[]>();

function rateLimited(customerId: string, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const prior = (recentRuns.get(customerId) ?? []).filter((t) => t > windowStart);
  if (prior.length >= diagnosisLimiter.maxPerMinute) {
    recentRuns.set(customerId, prior);
    return true;
  }
  prior.push(now);
  recentRuns.set(customerId, prior);
  return false;
}

export async function runDiagnosis(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
  opts?: { traceId?: string },
): Promise<RunDiagnosisResult> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }
  if (rateLimited(customerId)) {
    return { ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "Too many AI requests — wait a minute and retry" };
  }

  const assets = await prisma.uploadedAsset.findMany({
    where: { repairRequestId: repairId, assetKind: "INTAKE", deletedAt: null },
  });
  if (assets.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Upload at least one image before requesting AI assessment" };
  }

  await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "DIAGNOSIS_PENDING" } });
  const traceId = opts?.traceId;
  const env = getServerEnv();

  const storage = getStorage();
  const images: Array<{ mimeType: string; base64: string }> = [];
  for (const asset of assets.slice(0, 4)) {
    const obj = await storage.get(asset.storageKey);
    images.push({ mimeType: obj.mimeType, base64: obj.buffer.toString("base64") });
  }

  const userText = [
    `Device model selected by the customer: "${repair.deviceBrand} ${repair.deviceModel}".`,
    `Customer-reported symptoms: "${repair.symptoms}".`,
    repair.repairCategory ? `Pre-selected repair category: ${repair.repairCategory}.` : "",
    "Assess the attached image(s) and return only the JSON object.",
  ]
    .filter(Boolean)
    .join(" ");

  const result = await chatWithImage({ system: systemPromptForDiagnosis(), userText, images });

  if (!result.ok) {
    await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "DIAGNOSIS_FAILED" } });
    await writeAudit(prisma, {
      aggregateType: "RepairRequest",
      aggregateId: repairId,
      actorType: "SYSTEM",
      eventType: "diagnosis.failed",
      payload: { error: result.error, providerStatus: result.status ?? null },
      traceId,
    });
    const message =
      result.error === "TIMEOUT"
        ? "AI analysis timed out. Your request is saved — you can retry."
        : "AI analysis is unavailable. Your request is saved — you can retry or continue manually.";
    return { ok: false, code: "DEPENDENCY_UNAVAILABLE", message };
  }

  const parsed = DiagnosisReportSchema.safeParse(extractJsonObject({ content: result.text }));
  if (!parsed.success) {
    await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "DIAGNOSIS_FAILED" } });
    await writeAudit(prisma, {
      aggregateType: "RepairRequest",
      aggregateId: repairId,
      actorType: "SYSTEM",
      eventType: "diagnosis.schema_rejected",
      payload: { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) },
      traceId,
    });
    return { ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "AI output failed validation. Your request is saved — retry or continue manually." };
  }

  const report = parsed.data;
  const status = diagnosisStatusFor(report);
  const created = await prisma.diagnosisReport.create({
    data: {
      repairRequestId: repairId,
      provider: "openai-compatible",
      model: result.model,
      schemaVersion: DIAGNOSIS_SCHEMA_VERSION,
      deviceModelAssessment: report.deviceModelAssessment,
      visibleObservations: report.visibleObservations,
      suspectedCauses: report.suspectedCauses,
      likelyRepairCategory: report.likelyRepairCategory,
      confidenceBand: report.overallConfidence,
      unknowns: report.unknowns,
      recommendedQuestions: report.recommendedQuestions,
      limitations: report.limitations,
      rawOutputRedacted: result.text.slice(0, 4000),
    },
  });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { status } });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "SYSTEM",
    eventType: "diagnosis.completed",
    payload: { reportId: created.id, confidenceBand: report.overallConfidence, latencyMs: result.latencyMs, model: result.model, configuredModel: env.AI_MODEL },
    traceId,
  });
  return { ok: true, status, reportId: created.id, diagnosis: report };
}
