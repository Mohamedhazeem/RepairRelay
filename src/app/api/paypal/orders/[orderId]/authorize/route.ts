import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { authorizeApprovedOrder } from "@/domains/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prisma = new PrismaClient();

/** Server-side authorization of the buyer-approved order. JS SDK onApprove calls this. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { orderId } = await params;

  const outcome = await authorizeApprovedOrder(prisma, orderId, guard.session.userId);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" || outcome.code === "PROVIDER_OUTCOME_UNKNOWN" ? 409 : outcome.code === "DEPENDENCY_UNAVAILABLE" ? 503 : 502;
    return NextResponse.json({ ...jsonErrorBody(outcome.code, outcome.message, traceId), debugId: outcome.debugId }, { status });
  }
  return NextResponse.json({ traceId, ...outcome.result });
}
