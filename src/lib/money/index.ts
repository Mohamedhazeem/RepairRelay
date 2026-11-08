/**
 * Money primitives. Amounts are integer minor units (cents) inside the app.
 * Conversion to PayPal decimal strings happens only at the API boundary.
 * USD is the only demo currency (MVP rule).
 */

export const SUPPORTED_CURRENCIES = ["USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

function assertSupportedCurrency(currency: string): asserts currency is SupportedCurrency {
  if (!SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency)) {
    throw new Error(`Unsupported currency: ${currency}. MVP supports ${SUPPORTED_CURRENCIES.join(", ")} only.`);
  }
}

/** Integer minor units → decimal string, e.g. 9500 → "95.00". */
export function toDecimalString(amountMinor: number, currency: string = "USD"): string {
  assertSupportedCurrency(currency);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`Invalid amountMinor: ${amountMinor}`);
  }
  const sign = ""; // negatives rejected above
  const whole = Math.floor(amountMinor / 100);
  const cents = amountMinor % 100;
  return `${sign}${whole}.${String(cents).padStart(2, "0")}`;
}

/** Integer minor units → USD display string, e.g. 9500 → "$95.00". */
export function formatUsd(amountMinor: number): string {
  return `$${toDecimalString(amountMinor, "USD")}`;
}

export type ParsedMinor = { ok: true; amountMinor: number } | { ok: false; reason: string };

/**
 * Parse a decimal string ("95", "95.0", "95.00") into minor units.
 * Format-level only: 0 is allowed here; domain rules decide positivity.
 * Rejects: empty, signs, >2 fraction digits (excess precision), non-finite, unsafe magnitudes.
 */
export function parseDecimalToMinor(value: string): ParsedMinor {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, reason: "Amount is required" };
  }
  if (!/^\d+(?:\.(\d{1,2}))?$/.test(value)) {
    if (/^-/.test(value)) return { ok: false, reason: "Amount cannot be negative" };
    if (/^\d+\.\d{3,}$/.test(value)) return { ok: false, reason: "Amount has excess precision (max 2 decimal places)" };
    return { ok: false, reason: "Amount must be a plain decimal number" };
  }
  const [wholePart, fracPart = ""] = value.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt((fracPart + "00").slice(0, 2) || "0", 10);
  const amountMinor = whole * 100 + frac;
  if (!Number.isSafeInteger(amountMinor)) {
    return { ok: false, reason: "Amount exceeds the supported magnitude" };
  }
  return { ok: true, amountMinor };
}

/** Parse and require a positive amount (payments/quotes reject 0). */
export function parsePositiveDecimalToMinor(value: string): ParsedMinor {
  const parsed = parseDecimalToMinor(value);
  if (!parsed.ok) return parsed;
  if (parsed.amountMinor <= 0) return { ok: false, reason: "Amount must be greater than zero" };
  return parsed;
}

/** Sum minor-unit line items deterministically; throws on unsafe results. */
export function sumMinor(items: number[]): number {
  const total = items.reduce((acc, n) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid line item amount: ${n}`);
    return acc + n;
  }, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Total exceeds the supported magnitude");
  return total;
}
