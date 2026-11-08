import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { SlidingWindowRateLimiter } from "@/lib/ratelimit";
import { addIntakeAsset } from "@/domains/repairs/assetService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
const uploadLimiter = new SlidingWindowRateLimiter(20, 60 * 1000);


export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) {
    return NextResponse.json(
      jsonErrorBody(guard.code, guard.code === "UNAUTHENTICATED" ? "Sign in required" : "Customer role required", traceId),
      { status: statusForCode(guard.code) },
    );
  }
  const { repairId } = await params;
  const rl = uploadLimiter.check(guard.session.userId);
  if (!rl.allowed) {
    return NextResponse.json(jsonErrorBody("RATE_LIMITED", `Too many uploads — retry in ${rl.retryAfterSeconds}s`, traceId), { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Multipart form data required", traceId), { status: 400 });
  }
  const file = form.get("file");
  const assetKind = form.get("assetKind") ?? "INTAKE";
  if (!(file instanceof File)) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "file field is required", traceId), { status: 400 });
  }
  if (assetKind !== "INTAKE") {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Only INTAKE uploads are accepted on intake", traceId), { status: 400 });
  }

  const result = await addIntakeAsset(prisma, repairId, guard.session.userId, file);
  if (!result.ok) {
    return NextResponse.json(jsonErrorBody(result.code, result.message, traceId), { status: statusForCode(result.code) });
  }
  // Opaque asset id only — never the storage path.
  return NextResponse.json(
    { traceId, assetId: result.assetId, width: result.width, height: result.height, mimeType: result.mimeType, byteSize: result.byteSize },
    { status: 201 },
  );
}
