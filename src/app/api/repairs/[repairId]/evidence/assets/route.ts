import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { addEvidenceAsset } from "@/domains/evidence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** Private evidence uploads (after/component-label) by the assigned repairer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ repairId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) {
    return NextResponse.json(jsonErrorBody(guard.code, "Simulated repairer role required", traceId), { status: statusForCode(guard.code) });
  }
  const { repairId } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Multipart form data required", traceId), { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "file field is required", traceId), { status: 400 });
  }
  if (kind !== "AFTER" && kind !== "COMPONENT_LABEL") {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "kind must be AFTER or COMPONENT_LABEL", traceId), { status: 400 });
  }

  const outcome = await addEvidenceAsset(prisma, repairId, guard.session.userId, file, kind);
  if (!outcome.ok) {
    const status = outcome.code === "NOT_FOUND" ? 404 : outcome.code === "FORBIDDEN" ? 403 : outcome.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(jsonErrorBody(outcome.code, outcome.message, traceId), { status });
  }
  return NextResponse.json({ traceId, assetId: outcome.result.assetId, width: outcome.result.width, height: outcome.result.height }, { status: 201 });
}
