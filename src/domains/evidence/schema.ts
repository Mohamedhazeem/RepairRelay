/**
 * Evidence assessment contract (AI-AND-EVIDENCE.md §7). Advisory only:
 * completeness flags and consistency observations; never acceptance or payment.
 */

import { z } from "zod";

export const EVIDENCE_ASSESSMENT_SCHEMA_VERSION = 1;

export const EvidenceFlagSchema = z.strictObject({
  code: z.string().min(1).max(60),
  severity: z.enum(["BLOCKING_FOR_SUBMISSION", "REVIEW", "INFO"]),
  message: z.string().min(1).max(400),
});

export const EvidenceAssessmentSchema = z.strictObject({
  completeness: z.enum(["COMPLETE", "INCOMPLETE", "UNAVAILABLE"]),
  flags: z.array(EvidenceFlagSchema).max(10),
  consistencyObservations: z.array(
    z.strictObject({
      code: z.string().min(1).max(60),
      severity: z.enum(["REVIEW", "INFO"]),
      message: z.string().min(1).max(400),
    }),
  ).max(10),
  limitations: z.array(z.string().min(1).max(300)).max(10),
});

export type EvidenceAssessmentOutput = z.infer<typeof EvidenceAssessmentSchema>;
