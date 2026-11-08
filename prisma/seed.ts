/**
 * Demo seed: customer, three SIMULATED repairers, demo admin.
 * Idempotent (upsert by email). Passwords come from DEMO_SEED_PASSWORD.
 * All repairer actors are simulated demo data — never label them verified.
 */

import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

export type SeedAccount = {
  email: string;
  displayName: string;
  role: UserRole;
  /** Repairer demo description; empty for non-repairers. */
  demoDescription?: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    email: "customer@demo.repairrelay.test",
    displayName: "Demo Customer",
    role: UserRole.CUSTOMER,
  },
  {
    email: "repairer.ava@demo.repairrelay.test",
    displayName: "Ava's Phone Fix (Simulated)",
    role: UserRole.SIMULATED_REPAIRER,
    demoDescription: "Simulated repairer for the RepairRelay demo. Not a real business.",
  },
  {
    email: "repairer.marcus@demo.repairrelay.test",
    displayName: "Marcus Device Lab (Simulated)",
    role: UserRole.SIMULATED_REPAIRER,
    demoDescription: "Simulated repairer for the RepairRelay demo. Not a real business.",
  },
  {
    email: "repairer.nadia@demo.repairrelay.test",
    displayName: "Nadia Repair Co (Simulated)",
    role: UserRole.SIMULATED_REPAIRER,
    demoDescription: "Simulated repairer for the RepairRelay demo. Not a real business.",
  },
  {
    email: "admin@demo.repairrelay.test",
    displayName: "Demo Operator",
    role: UserRole.DEMO_ADMIN,
  },
];

export async function seedDemoUsers(prisma: PrismaClient, seedPassword: string): Promise<void> {
  if (seedPassword.length < 8) {
    throw new Error("DEMO_SEED_PASSWORD must be at least 8 characters");
  }
  const passwordHash = await hashPassword(seedPassword);
  for (const account of SEED_ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: { displayName: account.displayName, role: account.role, passwordHash, disabledAt: null },
      create: { email: account.email, displayName: account.displayName, role: account.role, passwordHash },
    });
  }
  // Simulated repairer demo profiles — always labelled SIMULATED, never verified actors.
  for (const account of SEED_ACCOUNTS.filter((a) => a.role === UserRole.SIMULATED_REPAIRER)) {
    const user = await prisma.user.findUnique({ where: { email: account.email } });
    if (!user) continue;
    await prisma.simulatedRepairer.upsert({
      where: { userId: user.id },
      update: { displayName: account.displayName, demoDescription: account.demoDescription ?? "Simulated demo actor.", active: true },
      create: {
        userId: user.id,
        displayName: account.displayName,
        demoDescription: account.demoDescription ?? "Simulated demo actor.",
      },
    });
  }
}

const isDirectRun = process.argv[1]?.endsWith("seed.ts");

if (isDirectRun) {
  const prisma = new PrismaClient();
  const seedPassword = process.env.DEMO_SEED_PASSWORD;
  if (!seedPassword) {
    console.error("DEMO_SEED_PASSWORD is required (set it in .env.local)");
    process.exit(1);
  }
  seedDemoUsers(prisma, seedPassword)
    .then(() => {
      console.log(`Seeded ${SEED_ACCOUNTS.length} demo accounts (customer, 3 simulated repairers, demo admin).`);
    })
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("Seed failed:", err instanceof Error ? err.message : err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
