import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { searchForRepair, latestSearchRows, type DiscoveryErrorCode } from "@/domains/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prisma = new PrismaClient();

/** GET: latest run rows (expired observations surface as not-fresh, never as current). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) {
    return NextResponse.json(jsonErrorBody("NOT_FOUND", "Repair request not found", traceId), { status: 404 });
  }
  const { rows, run } = await latestSearchRows(prisma, repairId);
  return NextResponse.json({ traceId, searchRun: run, results: rows, nextPageAvailable: false });
}

/** POST: run a fresh server-side Channel3 search (replacement-device comparison mode). */
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

  const outcome = await searchForRepair(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    return NextResponse.json(
      jsonErrorBody(outcome.code as DiscoveryErrorCode, outcome.message, traceId),
      { status: statusForCode(outcome.code as "DEPENDENCY_UNAVAILABLE") },
    );
  }
  return NextResponse.json({ traceId, searchRunId: outcome.searchRunId, status: outcome.status, results: outcome.results });
}
