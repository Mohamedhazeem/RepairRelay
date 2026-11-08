import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { recordCustomerDecision } from "@/domains/decisions/service";
import { captureAfterAcceptance, voidAfterCancellation } from "@/domains/payments/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const prisma = new PrismaClient();

const schema = z.strictObject({
  evidenceSubmissionId: z.string().uuid(),
  contractVersionId: z.string().uuid(),
  decision: z.enum(["ACCEPT", "REQUEST_REWORK", "CANCEL"]),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid decision", traceId), { status: 400 });
  }

  const outcome = await recordCustomerDecision(prisma, repairId, guard.session.userId, parsed.data, {
    capture: async (ctx) => {
      await captureAfterAcceptance(prisma, ctx.contractId, guard.session.userId, { traceId });
    },
    void: async (ctx) => {
      await voidAfterCancellation(prisma, ctx.contractId, guard.session.userId, { traceId });
    },
  });
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" || outcome.code === "FORBIDDEN" ? outcome.code === "FORBIDDEN" ? 403 : 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, ...outcome.result }, { status: 201 });
}
