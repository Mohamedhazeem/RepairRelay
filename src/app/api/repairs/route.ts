import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";
import { createRepairRequest } from "@/domains/repairs/assetService";
import { DEVICE_CATALOG, OTHER_DEVICE } from "@/domains/repairs/deviceCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const createSchema = z.strictObject({
  deviceBrand: z.string().min(1).max(60),
  deviceModel: z.string().min(1).max(120),
  isOtherDevice: z.boolean(),
  symptoms: z.string().min(10).max(2000),
  repairCategory: z
    .enum(["DISPLAY_REPLACEMENT", "BATTERY_REPLACEMENT", "CHARGING_PORT_REPLACEMENT", "CAMERA_REPLACEMENT", "DIAGNOSTIC_ONLY", "OTHER"])
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request", traceId), {
      status: 400,
    });
  }

  const result = await createRepairRequest(prisma, { ...parsed.data, repairCategory: parsed.data.repairCategory ?? null, customerId: guard.session.userId });
  if (!result.ok) {
    return NextResponse.json(jsonErrorBody(result.code, result.message, traceId), { status: statusForCode(result.code) });
  }
  return NextResponse.json(
    {
      traceId,
      repairId: result.repairRequest.id,
      publicReference: result.repairRequest.publicReference,
      status: result.repairRequest.status,
      version: result.repairRequest.version,
    },
    { status: 201 },
  );
}

export async function GET() {
  const traceId = newTraceId();
  return NextResponse.json({ traceId, deviceCatalog: DEVICE_CATALOG, otherDeviceValue: OTHER_DEVICE });
}
