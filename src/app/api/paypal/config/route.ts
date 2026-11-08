import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { jsonErrorBody, newTraceId } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public JS SDK configuration — the client ID is public by design; the secret stays server-side. */
export async function GET() {
  const traceId = newTraceId();
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Sign in required", traceId), { status: 401 });
  }
  const env = getServerEnv();
  if (!env.PAYPAL_CLIENT_ID) {
    return NextResponse.json(jsonErrorBody("DEPENDENCY_UNAVAILABLE", "Payments are not configured on the server", traceId), { status: 503 });
  }
  return NextResponse.json({
    traceId,
    clientId: env.PAYPAL_CLIENT_ID,
    currency: env.PAYPAL_CURRENCY,
    environment: env.PAYPAL_ENV,
    intent: "authorize",
  });
}
