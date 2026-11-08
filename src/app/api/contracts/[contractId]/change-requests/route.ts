import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { createChangeRequest } from "@/domains/contracts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const changesSchema = z
  .object({
    componentLabel: z.string().min(1).max(160).optional(),
    partChargeMinor: z.number().int().min(0).optional(),
    labourMinor: z.number().int().min(0).optional(),
    feesMinor: z.number().int().min(0).optional(),
    taxMinor: z.number().int().min(0).optional(),
    warrantyDays: z.number().int().min(0).max(3650).optional(),
    estimatedDurationHours: z.number().int().min(1).max(720).optional(),
    scopeText: z.string().min(1).max(2000).optional(),
    exclusionsText: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one change is required" });

const schema = z.strictObject({
  expectedContractVersion: z.number().int().positive(),
  reason: z.string().min(10).max(1000),
  proposedChanges: changesSchema,
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Simulated repairer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { contractId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid change request", traceId), { status: 400 });
  }

  const outcome = await createChangeRequest(prisma, contractId, guard.session.userId, parsed.data);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" ? 409 : outcome.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, changeRequestId: outcome.changeRequestId, before: outcome.before, after: outcome.after }, { status: 201 });
}
