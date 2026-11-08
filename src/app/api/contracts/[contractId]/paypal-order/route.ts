import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { SlidingWindowRateLimiter } from "@/lib/ratelimit";
import { createOrderForContract } from "@/domains/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prisma = new PrismaClient();
const paymentLimiter = new SlidingWindowRateLimiter(10, 60 * 1000);


const schema = z.strictObject({ expectedContractVersion: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Customer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { contractId } = await params;
  const rl = paymentLimiter.check(guard.session.userId);
  if (!rl.allowed) {
    return NextResponse.json(jsonErrorBody("RATE_LIMITED", `Too many payment attempts — retry in ${rl.retryAfterSeconds}s`, traceId), { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "expectedContractVersion is required", traceId), { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const outcome = await createOrderForContract(prisma, contractId, guard.session.userId, { expectedContractVersion: parsed.data.expectedContractVersion, appUrl });
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "CONFLICT" || outcome.code === "PROVIDER_OUTCOME_UNKNOWN" ? 409 : outcome.code === "DEPENDENCY_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  // Public integration data only — never the client secret.
  return NextResponse.json({ traceId, ...outcome.result });
}
