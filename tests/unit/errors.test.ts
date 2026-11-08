import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, errorEnvelope, statusForCode } from "@/lib/http/errors";

describe("API error envelope", () => {
  it("contains exactly code, message and traceId", () => {
    const envelope = errorEnvelope("VALIDATION_ERROR", "Bad input");
    expect(Object.keys(envelope).sort()).toEqual(["code", "message", "traceId"]);
    expect(envelope.code).toBe("VALIDATION_ERROR");
    expect(envelope.traceId).toMatch(/[0-9a-f-]{36}/);
  });

  it("supports all documented stable codes", () => {
    expect(API_ERROR_CODES).toContain("PROVIDER_OUTCOME_UNKNOWN");
    expect(API_ERROR_CODES).toContain("PAYMENT_REQUIRES_RECONCILIATION");
    expect(API_ERROR_CODES).toContain("ASSET_INVALID");
    expect(statusForCode("UNAUTHENTICATED")).toBe(401);
    expect(statusForCode("CONFLICT")).toBe(409);
    expect(statusForCode("RATE_LIMITED")).toBe(429);
    expect(statusForCode("INTERNAL_ERROR")).toBe(500);
  });
});
