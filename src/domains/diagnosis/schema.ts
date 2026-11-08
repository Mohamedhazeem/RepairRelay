/**
 * Diagnosis report contract (AI-AND-EVIDENCE.md §4). Strict Zod schema:
 * confidence bands only — arbitrary percentages are rejected; extra keys rejected.
 * AI output is untrusted until this schema validates it.
 */

import { z } from "zod";

export const DIAGNOSIS_SCHEMA_VERSION = 1;

export const CERTAINTY_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export const CONFIDENCE_BANDS = ["LOW", "MEDIUM", "HIGH", "UNASSESSED"] as const;

const certainty = z.enum(CERTAINTY_VALUES);

export const DeviceModelAssessmentSchema = z.strictObject({
  value: z.string().min(1).max(120),
  source: z.enum(["USER_SELECTED", "AI_SUGGESTED", "UNKNOWN"]),
  needsConfirmation: z.boolean(),
});

export const VisibleObservationSchema = z.strictObject({
  observation: z.string().min(1).max(500),
  evidence: z.string().min(1).max(200),
  certainty,
});

export const SuspectedCauseSchema = z.strictObject({
  cause: z.string().min(1).max(500),
  certainty,
  basis: z.string().min(1).max(300),
});

export const DiagnosisReportSchema = z.strictObject({
  deviceModelAssessment: DeviceModelAssessmentSchema,
  visibleObservations: z.array(VisibleObservationSchema).max(10),
  suspectedCauses: z.array(SuspectedCauseSchema).max(10),
  likelyRepairCategory: z.string().max(60),
  overallConfidence: z.enum(CONFIDENCE_BANDS),
  unknowns: z.array(z.string().min(1).max(300)).max(10),
  recommendedQuestions: z.array(z.string().min(1).max(300)).max(10),
  limitations: z.array(z.string().min(1).max(300)).max(10),
});

export type DiagnosisReport = z.infer<typeof DiagnosisReportSchema>;

/** Deterministic mapping from a validated report to the repair-request status. */
export function diagnosisStatusFor(report: DiagnosisReport): "DIAGNOSIS_READY" | "DIAGNOSIS_INCONCLUSIVE" {
  return report.overallConfidence === "UNASSESSED" ? "DIAGNOSIS_INCONCLUSIVE" : "DIAGNOSIS_READY";
}
