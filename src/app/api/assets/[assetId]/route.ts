import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { jsonErrorBody, newTraceId } from "@/lib/http/errors";
import { canAccessAsset, getOwnedRepair } from "@/domains/repairs/assetService";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/** Private asset preview. Authorization is enforced server-side on every read. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Sign in required", traceId), { status: 401 });
  }
  const { assetId } = await params;
  const asset = await prisma.uploadedAsset.findUnique({ where: { id: assetId }, include: { repairRequest: true } });
  if (!asset || asset.deletedAt) {
    return NextResponse.json(jsonErrorBody("NOT_FOUND", "Asset not found", traceId), { status: 404 });
  }

  const allowed =
    canAccessAsset(session, asset) ||
    // Demo operators may inspect for diagnostics; simulated repairers only for assigned jobs (later slices).
    session.role === "DEMO_ADMIN";
  if (!allowed) {
    return NextResponse.json(jsonErrorBody("FORBIDDEN", "Not authorized for this asset", traceId), { status: 403 });
  }
  void getOwnedRepair;

  try {
    const { buffer, mimeType } = await getStorage().get(asset.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(jsonErrorBody("NOT_FOUND", "Asset content unavailable", traceId), { status: 404 });
  }
}
