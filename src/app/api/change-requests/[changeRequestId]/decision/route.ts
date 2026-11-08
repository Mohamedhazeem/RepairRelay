import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { decideChangeRequest } from "@/domains/contracts/service";
import { voidAfterCancellation } from "@/domains/payments/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const schema = z.strictObject({
  decision: z.enum(["APPROVE", "REJECT"]),
  expectedContractVersion: z.number().int().positive(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ changeRequestId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { changeRequestId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "decision and expectedContractVersion are required", traceId), { status: 400 });
  }

  const outcome = await decideChangeRequest(prisma, changeRequestId, guard.session.userId, parsed.data);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  // Amount change with an existing authorization: release the old payment (S04 contract).
  // The contract stays APPROVED; a new buyer approval + authorization is required for the new total.
  let paymentReleased = false;
  if (outcome.decision === "APPROVED" && outcome.amountChanged) {
    const cr = await prisma.contractChangeRequest.findUnique({ where: { id: changeRequestId }, include: { contract: true } });
    if (cr) {
      const payment = await prisma.paymentAttempt.findFirst({ where: { repairContractId: cr.contractId }, orderBy: { createdAt: "desc" } });
      if (payment?.status === "AUTHORIZED") {
        const voided = await voidAfterCancellation(prisma, cr.contractId, guard.session.userId, { traceId, contractChange: true });
        paymentReleased = voided.ok;
      }
    }
  }
  return NextResponse.json({ traceId, ...outcome, paymentReleased });
}
