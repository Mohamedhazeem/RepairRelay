import { describe, expect, it } from "vitest";
import {
  formatUsd,
  parseDecimalToMinor,
  parsePositiveDecimalToMinor,
  sumMinor,
  toDecimalString,
} from "@/lib/money";

describe("toDecimalString", () => {
  it("formats integer cents as a decimal string", () => {
    expect(toDecimalString(9500)).toBe("95.00");
    expect(toDecimalString(1)).toBe("0.01");
    expect(toDecimalString(0)).toBe("0.00");
    expect(toDecimalString(105)).toBe("1.05");
    expect(toDecimalString(123456)).toBe("1234.56");
  });

  it("rejects negative, fractional and unsafe inputs", () => {
    expect(() => toDecimalString(-1)).toThrow();
    expect(() => toDecimalString(10.5)).toThrow();
    expect(() => toDecimalString(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => toDecimalString(NaN)).toThrow();
    expect(() => toDecimalString(Infinity)).toThrow();
  });

  it("rejects non-USD currency (MVP rule)", () => {
    expect(() => toDecimalString(100, "EUR")).toThrow(/Unsupported currency/);
    expect(() => toDecimalString(100, "INR")).toThrow(/Unsupported currency/);
  });
});

describe("formatUsd", () => {
  it("renders currency symbol from minor units", () => {
    expect(formatUsd(9500)).toBe("$95.00");
    expect(formatUsd(5)).toBe("$0.05");
  });
});

describe("parseDecimalToMinor", () => {
  it("accepts plain decimals up to 2 places", () => {
    expect(parseDecimalToMinor("95")).toEqual({ ok: true, amountMinor: 9500 });
    expect(parseDecimalToMinor("95.0")).toEqual({ ok: true, amountMinor: 9500 });
    expect(parseDecimalToMinor("95.00")).toEqual({ ok: true, amountMinor: 9500 });
    expect(parseDecimalToMinor("0.05")).toEqual({ ok: true, amountMinor: 5 });
    expect(parseDecimalToMinor("0")).toEqual({ ok: true, amountMinor: 0 });
  });

  it("rejects excess precision", () => {
    expect(parseDecimalToMinor("95.001").ok).toBe(false);
    expect(parseDecimalToMinor("0.005").ok).toBe(false);
  });

  it("rejects negative, empty, non-numeric and huge values", () => {
    expect(parseDecimalToMinor("-5").ok).toBe(false);
    expect(parseDecimalToMinor("").ok).toBe(false);
    expect(parseDecimalToMinor("  ").ok).toBe(false);
    expect(parseDecimalToMinor("abc").ok).toBe(false);
    expect(parseDecimalToMinor("NaN").ok).toBe(false);
    expect(parseDecimalToMinor("Infinity").ok).toBe(false);
    expect(parseDecimalToMinor("1e9").ok).toBe(false);
    // huge: more than MAX_SAFE_INTEGER minor units
    expect(parseDecimalToMinor("100000000000000").ok).toBe(false);
  });
});

describe("parsePositiveDecimalToMinor", () => {
  it("rejects zero for payment amounts", () => {
    expect(parsePositiveDecimalToMinor("0").ok).toBe(false);
    expect(parsePositiveDecimalToMinor("0.00").ok).toBe(false);
    expect(parsePositiveDecimalToMinor("0.01")).toEqual({ ok: true, amountMinor: 1 });
  });
});

describe("sumMinor", () => {
  it("sums line items deterministically (no float math)", () => {
    expect(sumMinor([2000, 300, 5])).toBe(2305);
    expect(sumMinor([])).toBe(0);
  });

  it("rejects negative or invalid line items", () => {
    expect(() => sumMinor([100, -1])).toThrow();
    expect(() => sumMinor([1.5])).toThrow();
  });
});
