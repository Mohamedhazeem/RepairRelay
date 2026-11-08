import { describe, expect, it } from "vitest";
import { DiagnosisReportSchema, diagnosisStatusFor } from "@/domains/diagnosis/schema";

const validReport = {
  deviceModelAssessment: { value: "Apple iPhone 13", source: "USER_SELECTED", needsConfirmation: false },
  visibleObservations: [{ observation: "Crack across front glass", evidence: "intake-image-1", certainty: "HIGH" }],
  suspectedCauses: [{ cause: "Display assembly damage", certainty: "MEDIUM", basis: "Visible fracture" }],
  likelyRepairCategory: "DISPLAY_REPLACEMENT",
  overallConfidence: "MEDIUM",
  unknowns: ["Touch functionality untested"],
  recommendedQuestions: ["Does touch respond everywhere?"],
  limitations: ["Physical inspection required"],
};

describe("diagnosis schema", () => {
  it("accepts a valid report", () => {
    expect(DiagnosisReportSchema.safeParse(validReport).success).toBe(true);
  });

  it("rejects missing required keys", () => {
    const missing = { ...validReport } as Record<string, unknown>;
    delete missing.overallConfidence;
    expect(DiagnosisReportSchema.safeParse(missing).success).toBe(false);
    const noObservations = { ...validReport, visibleObservations: undefined };
    expect(DiagnosisReportSchema.safeParse(noObservations).success).toBe(false);
  });

  it("rejects extra unexpected keys (strict)", () => {
    expect(DiagnosisReportSchema.safeParse({ ...validReport, price: 87 }).success).toBe(false);
  });

  it("rejects arbitrary percentage confidence — bands only", () => {
    expect(DiagnosisReportSchema.safeParse({ ...validReport, overallConfidence: "87%" }).success).toBe(false);
    expect(DiagnosisReportSchema.safeParse({ ...validReport, overallConfidence: 0.87 }).success).toBe(false);
    expect(DiagnosisReportSchema.safeParse({ ...validReport, overallConfidence: "VERY_HIGH" }).success).toBe(false);
  });

  it("rejects observation without evidence reference", () => {
    const bad = { ...validReport, visibleObservations: [{ observation: "crack", certainty: "HIGH" }] };
    expect(DiagnosisReportSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty observations with UNASSESSED (inconclusive path)", () => {
    const inconclusive = {
      ...validReport,
      visibleObservations: [],
      suspectedCauses: [],
      likelyRepairCategory: "UNASSESSED",
      overallConfidence: "UNASSESSED",
    };
    expect(DiagnosisReportSchema.safeParse(inconclusive).success).toBe(true);
    expect(diagnosisStatusFor(inconclusive as never)).toBe("DIAGNOSIS_INCONCLUSIVE");
  });

  it("maps assessed reports to DIAGNOSIS_READY", () => {
    expect(diagnosisStatusFor(validReport as never)).toBe("DIAGNOSIS_READY");
  });
});
