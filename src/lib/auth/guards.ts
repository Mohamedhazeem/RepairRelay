/**
 * Role/ownership guard primitives. Route handlers and pages must call these;
 * hidden UI buttons are never authorization.
 */

import type { SessionUser } from "@/lib/auth/session";
import type { UserRole } from "@prisma/client";

export type GuardFailure = { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" };
export type GuardSuccess = { ok: true; session: SessionUser };
export type GuardResult = GuardSuccess | GuardFailure;

export function requireAuthenticated(session: SessionUser | null): GuardResult {
  if (!session) return { ok: false, code: "UNAUTHENTICATED" };
  return { ok: true, session };
}

export function requireRole(session: SessionUser | null, ...allowed: UserRole[]): GuardResult {
  const base = requireAuthenticated(session);
  if (!base.ok) return base;
  if (!allowed.includes(base.session.role)) return { ok: false, code: "FORBIDDEN" };
  return base;
}

/** Pages: true if the user may see a role-scoped area. */
export function hasRole(session: SessionUser | null, ...allowed: UserRole[]): boolean {
  return requireRole(session, ...allowed).ok;
}
