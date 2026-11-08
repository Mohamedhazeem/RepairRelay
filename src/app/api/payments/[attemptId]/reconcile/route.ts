import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { reconcileAttempt } from "@/domains/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prisma = new PrismaClient();

/** Operator/demo-admin reconciliation: provider reads only, never a new mutation. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "DEMO_ADMIN");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Demo operator role required", traceId), { status: statusForCode(guard.code) });
  }
  const { attemptId } = await params;
  const outcome = await reconcileAttempt(prisma, attemptId);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "VALIDATION_ERROR" ? 400 : 503;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, ...outcome.result });
}
