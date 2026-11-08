import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { submitEvidence } from "@/domains/evidence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const prisma = new PrismaClient();

const schema = z.strictObject({
  contractVersionId: z.string().uuid(),
  componentDeclaration: z.string().min(5).max(1000),
  componentIdentityBasis: z.enum(["LABEL_PHOTO", "TECHNICIAN_DECLARATION", "OTHER"]),
  functionalChecks: z
    .array(z.strictObject({ check: z.string().min(1).max(60), result: z.enum(["PASS", "FAIL"]) }))
    .min(1)
    .max(10),
  afterAssetIds: z.array(z.string().uuid()).min(1).max(4),
  componentAssetIds: z.array(z.string().uuid()).max(4),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Simulated repairer role required", traceId), { status: statusForCode(guard.code) });
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
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid evidence submission", traceId), { status: 400 });
  }

  const outcome = await submitEvidence(prisma, repairId, guard.session.userId, parsed.data);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "FORBIDDEN" ? 403 : outcome.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, ...outcome.result }, { status: 201 });
}
