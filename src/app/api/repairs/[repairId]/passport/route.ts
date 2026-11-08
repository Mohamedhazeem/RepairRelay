import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId } from "@/lib/http/errors";
import { getPassport } from "@/domains/passport/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Sign in required", traceId), { status: 401 });
  }
  const { repairId } = await params;
  const outcome = await getPassport(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status: 404 });
  }
  return NextResponse.json({ traceId, ...outcome });
}
