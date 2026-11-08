import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { startJob } from "@/domains/evidence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** Repairer starts the job — requires approved contract + confirmed AUTHORIZED payment. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Simulated repairer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;
  const outcome = await startJob(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" || outcome.code === "FORBIDDEN" ? outcome.code === "FORBIDDEN" ? 403 : 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, ...outcome.result }, { status: 201 });
}
