import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { createSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { requireAuthenticated, requireRole } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";

const user: SessionUser = {
  userId: "u-123",
  email: "customer@demo.repairrelay.test",
  displayName: "Demo Customer",
  role: "CUSTOMER",
};

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password entirely", hash)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("refuses short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("session token", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(user);
    const decoded = await verifySessionToken(token);
    expect(decoded).toEqual(user);
  });

  it("rejects tampered or absent tokens", async () => {
    const token = await createSessionToken(user);
    expect(await verifySessionToken(token + "x")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
  });

  it("has a bounded lifetime", () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});

describe("role guards", () => {
  it("requires authentication", () => {
    expect(requireAuthenticated(null)).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(requireAuthenticated(user)).toEqual({ ok: true, session: user });
  });

  it("enforces role boundaries per area", () => {
    // Customer area
    expect(requireRole(user, "CUSTOMER").ok).toBe(true);
    expect(requireRole(user, "SIMULATED_REPAIRER")).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(requireRole(user, "DEMO_ADMIN")).toEqual({ ok: false, code: "FORBIDDEN" });

    const repairer: SessionUser = { ...user, role: "SIMULATED_REPAIRER" };
    const admin: SessionUser = { ...user, role: "DEMO_ADMIN" };
    expect(requireRole(repairer, "CUSTOMER").ok).toBe(false);
    expect(requireRole(admin, "DEMO_ADMIN").ok).toBe(true);
  });
});
