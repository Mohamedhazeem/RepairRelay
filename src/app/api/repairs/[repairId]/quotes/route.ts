import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { ensureQuotes, listQuotes } from "@/domains/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** GET: list existing quotes (read-only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;
  const outcome = await listQuotes(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status: outcome.code === "NOT_FOUND" ? 404 : 400 });
  }
  return NextResponse.json({ traceId, quotes: outcome.quotes });
}

/** POST: idempotently generate the three deterministic demo quotes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;
  void req;

  const outcome = await ensureQuotes(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status: outcome.code === "NOT_FOUND" ? 404 : 400 });
  }
  return NextResponse.json({ traceId, quotes: outcome.quotes }, { status: 201 });
}
