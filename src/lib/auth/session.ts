/**
 * Session auth baseline (S00-owned). Signed JWT in an HttpOnly cookie via jose.
 * Deliberately not Auth.js: zero public-signup demo with three seeded roles;
 * a small auditable session layer is the documented "or equivalent" option.
 */

import { SignJWT, jwtVerify } from "jose";
import { getServerEnv } from "@/lib/env";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE = "repairrelay_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
};

function secretKey(): Uint8Array {
  const secret = getServerEnv().AUTH_SECRET;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, displayName: user.displayName, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setIssuer("repairrelay")
    .setAudience("repairrelay-app")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for missing, tampered, expired or wrongly-audience tokens. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "repairrelay",
      audience: "repairrelay-app",
    });
    const { sub, email, displayName, role } = payload as Record<string, unknown>;
    if (
      typeof sub !== "string" ||
      typeof email !== "string" ||
      typeof displayName !== "string" ||
      (role !== "CUSTOMER" && role !== "SIMULATED_REPAIRER" && role !== "DEMO_ADMIN")
    ) {
      return null;
    }
    return { userId: sub, email, displayName, role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const isProd = getServerEnv().NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
