import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { runDiagnosis } from "@/domains/diagnosis/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const prisma = new PrismaClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(
      jsonErrorBody(guard.code, guard.code === "UNAUTHENTICATED" ? "Sign in required" : "Customer role required", traceId),
      { status: statusForCode(guard.code) },
    );
  }
  const { repairId } = await params;
  void req; // body intentionally ignored; request state comes from the persisted draft

  const result = await runDiagnosis(prisma, repairId, guard.session.userId, { traceId });
  if (!result.ok) {
    return NextResponse.json(jsonErrorBody(result.code, result.message, traceId), { status: statusForCode(result.code) });
  }
  return NextResponse.json({ traceId, status: result.status, reportId: result.reportId, diagnosis: result.diagnosis });
}
