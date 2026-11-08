import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { selectQuote } from "@/domains/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const selectSchema = z.strictObject({ expectedRepairVersion: z.number().int().positive() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ repairId: string; quoteId: string }> },
) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId, quoteId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "expectedRepairVersion is required", traceId), { status: 400 });
  }

  const outcome = await selectQuote(prisma, repairId, quoteId, guard.session.userId, parsed.data.expectedRepairVersion);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, quote: outcome.quote });
}
