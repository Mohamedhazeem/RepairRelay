import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { resetDemoData } from "@/domains/admin/demoReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const prisma = new PrismaClient();

/** Demo-operator-only reset: wipes transactions + assets, re-seeds accounts. */
export async function POST() {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "DEMO_ADMIN");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Demo operator role required", traceId), { status: statusForCode(guard.code) });
  }
  const seedPassword = process.env.DEMO_SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 8) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "DEMO_SEED_PASSWORD is not configured", traceId), { status: 400 });
  }
  await resetDemoData(prisma, seedPassword);
  return NextResponse.json({ traceId, ok: true, message: "Demo data wiped and accounts re-seeded" });
}
