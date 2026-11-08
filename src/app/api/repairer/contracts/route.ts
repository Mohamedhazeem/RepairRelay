import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { termsFromVersion } from "@/domains/contracts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** Contracts where this simulated repairer's quote is selected — for change proposals. */
export async function GET() {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Simulated repairer role required", traceId), { status: statusForCode(guard.code) });
  }
  const repairer = await prisma.simulatedRepairer.findUnique({ where: { userId: guard.session.userId } });
  if (!repairer) {
    return NextResponse.json({ traceId, contracts: [] });
  }
  const quotes = await prisma.repairQuote.findMany({
    where: { repairerId: repairer.id, status: "SELECTED" },
    include: {
      repairRequest: { include: { contract: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } } } },
    },
  });
  const contracts = quotes
    .filter((q) => q.repairRequest.contract)
    .map((q) => {
      const contract = q.repairRequest.contract!;
      const latest = contract.versions[0];
      return {
        contractId: contract.id,
        repairReference: q.repairRequest.publicReference,
        device: `${q.repairRequest.deviceBrand} ${q.repairRequest.deviceModel}`,
        status: contract.status,
        version: contract.version,
        terms: termsFromVersion(latest),
        pendingChange: false, // single pending request at a time; kept simple for the demo workbench
      };
    });
  return NextResponse.json({ traceId, contracts });
}
