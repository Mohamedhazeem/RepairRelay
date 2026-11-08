/**
 * Integration test (local Postgres): seed is reproducible and idempotent.
 * Uses the same database as local development (reset-safe: only upserts demo users).
 */

import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SEED_ACCOUNTS, seedDemoUsers } from "../../prisma/seed";
import { verifyPassword } from "../../src/lib/security/password";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("demo seed", () => {
  it("creates exactly the documented demo accounts, idempotently", async () => {
    const seedPassword = process.env.DEMO_SEED_PASSWORD ?? "demo-password-for-tests-only";
    await seedDemoUsers(prisma, seedPassword);
    await seedDemoUsers(prisma, seedPassword); // second run must not fail or duplicate

    for (const account of SEED_ACCOUNTS) {
      const user = await prisma.user.findUnique({ where: { email: account.email } });
      expect(user, account.email).not.toBeNull();
      expect(user!.role).toBe(account.role);
      expect(user!.displayName).toBe(account.displayName);
      expect(await verifyPassword(seedPassword, user!.passwordHash)).toBe(true);
    }

    const repairers = await prisma.user.findMany({ where: { role: "SIMULATED_REPAIRER" } });
    expect(repairers.length).toBe(3);
  });
});
