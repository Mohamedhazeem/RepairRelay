import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { jsonErrorBody, newTraceId, statusForCode } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Session introspection endpoint — used by smoke tests and the shell. */
export async function GET() {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Not signed in", traceId), {
      status: statusForCode("UNAUTHENTICATED"),
    });
  }
  return NextResponse.json({ traceId, user: session });
}
