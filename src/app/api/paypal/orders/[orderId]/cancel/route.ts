import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { markBuyerCancelled } from "@/domains/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** JS SDK onCancel: marks the approval flow cancelled (not a paid state). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { orderId } = await params;
  const outcome = await markBuyerCancelled(prisma, orderId, guard.session.userId);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, ...outcome.result });
}
