/**
 * Shared API error envelope and stable codes per docs/architecture/API-CONTRACTS.md.
 * Never expose provider secrets, raw provider payloads, stack traces or internal paths.
 */

import { randomUUID } from "node:crypto";

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "PROVIDER_OUTCOME_UNKNOWN",
  "PAYMENT_REQUIRES_RECONCILIATION",
  "ASSET_INVALID",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  PROVIDER_REJECTED: 502,
  PROVIDER_OUTCOME_UNKNOWN: 502,
  PAYMENT_REQUIRES_RECONCILIATION: 409,
  ASSET_INVALID: 400,
  INTERNAL_ERROR: 500,
};

export type ErrorEnvelope = {
  code: ApiErrorCode;
  message: string;
  traceId: string;
};

export function newTraceId(): string {
  return randomUUID();
}

export function errorEnvelope(code: ApiErrorCode, message: string, traceId: string = newTraceId()): ErrorEnvelope {
  return { code, message, traceId };
}

export function statusForCode(code: ApiErrorCode): number {
  return DEFAULT_STATUS[code];
}

/** Standard body for a failed JSON API response. */
export function jsonErrorBody(code: ApiErrorCode, message: string, traceId: string = newTraceId()): ErrorEnvelope {
  return errorEnvelope(code, message, traceId);
}
