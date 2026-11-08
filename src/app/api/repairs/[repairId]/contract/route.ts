import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { createContractFromSelection, termsFromVersion } from "@/domains/contracts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** GET: current contract view (versions + pending change) for the repair owner. */
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
    return NextResponse.json({ traceId, contract: null });
  }
  const contract = await prisma.repairContract.findUnique({
    where: { repairRequestId: repairId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      changeRequests: { where: { status: "PENDING" }, take: 1 },
    },
  });
  if (!contract) {
    return NextResponse.json({ traceId, contract: null });
  }
  return NextResponse.json({
    traceId,
    contract: {
      id: contract.id,
      status: contract.status,
      version: contract.version,
      totalMinor: contract.totalMinor,
      currentTerms: contract.currentVersionId ? termsFromVersion(contract.versions.find((v) => v.id === contract.currentVersionId)!) : null,
      history: contract.versions.map((v) => ({ versionNumber: v.versionNumber, totalMinor: v.totalMinor, changeReason: v.changeReason, approvedAt: v.customerApprovedAt?.toISOString() ?? null })),
      pendingChange: contract.changeRequests[0]
        ? { id: contract.changeRequests[0].id, reason: contract.changeRequests[0].reason, proposedVersionId: contract.changeRequests[0].proposedVersionId }
        : null,
    },
  });
}

/** POST: create the contract from the selected quote (idempotent). */
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

  const outcome = await createContractFromSelection(prisma, repairId, guard.session.userId);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, contractId: outcome.contractId, status: outcome.status, version: outcome.version, totalMinor: outcome.totalMinor }, { status: 201 });
}
