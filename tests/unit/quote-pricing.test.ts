import { describe, expect, it } from "vitest";
import { computeQuote, QUOTE_PROFILES } from "../../src/domains/quotes/pricing";

describe("deterministic quote pricing", () => {
  it("totals part + labour + fees + tax in integer minor units", () => {
    const q = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[1]);
    expect(q.totalMinor).toBe(q.partChargeMinor + q.labourMinor + q.feesMinor + q.taxMinor);
    expect(Number.isInteger(q.totalMinor)).toBe(true);
    expect(q.totalMinor).toBe(6999 + 3499);
  });

  it("is deterministic — same inputs, same amounts", () => {
    const a = computeQuote("BATTERY_REPLACEMENT", QUOTE_PROFILES[0]);
    const b = computeQuote("BATTERY_REPLACEMENT", QUOTE_PROFILES[0]);
    expect(a).toEqual(b);
  });

  it("produces three distinct totals (budget/standard/premium)", () => {
    const totals = QUOTE_PROFILES.map((p) => computeQuote("DISPLAY_REPLACEMENT", p).totalMinor);
    expect(new Set(totals).size).toBe(3);
    expect(totals[0]).toBeLessThan(totals[1]);
    expect(totals[1]).toBeLessThan(totals[2]);
  });

  it("keeps all amounts positive except the parts-free diagnostic category", () => {
    for (const category of ["DISPLAY_REPLACEMENT", "BATTERY_REPLACEMENT", "CHARGING_PORT_REPLACEMENT", "CAMERA_REPLACEMENT", "OTHER"] as const) {
      for (const profile of QUOTE_PROFILES) {
        const q = computeQuote(category, profile);
        expect(q.partChargeMinor).toBeGreaterThan(0);
        expect(q.totalMinor).toBeGreaterThan(0);
      }
    }
    const diagnostic = computeQuote("DIAGNOSTIC_ONLY", QUOTE_PROFILES[0]);
    expect(diagnostic.partChargeMinor).toBe(0);
    expect(diagnostic.labourMinor).toBeGreaterThan(0);
    expect(diagnostic.componentLabel).toContain("No parts required");
  });

  it("warranty and turnaround come from the profile", () => {
    const premium = computeQuote("DISPLAY_REPLACEMENT", QUOTE_PROFILES[2]);
    expect(premium.warrantyDays).toBe(365);
    expect(premium.estimatedDurationHours).toBe(6);
    expect(premium.warrantyText).toContain("simulated demo terms");
  });
});
