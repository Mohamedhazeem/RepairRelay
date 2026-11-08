import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { selectCandidate } from "@/domains/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prisma = new PrismaClient();

const selectionSchema = z.strictObject({
  candidateId: z.string().uuid(),
  channel3ProductId: z.string().min(1).max(64),
  offerDomain: z.string().min(1).max(120),
  expectedPriceMinor: z.number().int().positive(),
  currency: z.literal("USD"),
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
  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid selection", traceId), { status: 400 });
  }

  const outcome = await selectCandidate(prisma, repairId, guard.session.userId, parsed.data);
  if (!outcome.ok) {
    if (outcome.code === "OFFER_CHANGED") {
      return NextResponse.json(
        { ...jsonErrorBody("CONFLICT", outcome.message, traceId), fresh: outcome.fresh },
        { status: 409 },
      );
    }
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "PROVIDER_REJECTED" ? 502 : statusForCode("DEPENDENCY_UNAVAILABLE");
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, selected: outcome.selected });
}
