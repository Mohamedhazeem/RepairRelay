import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Request-boundary guard (Next 16 `proxy` convention — `middleware` is deprecated).
 * Presence + claims of the session cookie for role-scoped areas.
 * Pages additionally verify server-side (defense in depth).
 *
 * Runs on the Node.js runtime: `proxy` does not support the edge runtime and the
 * runtime is not configurable. `verifySessionToken` swallows configuration errors
 * and returns null, so a bad environment degrades to "signed out" (redirect to
 * /login) rather than a 500.
 */

const AREA_ROLES: Array<{ prefix: string; roles: Array<"CUSTOMER" | "SIMULATED_REPAIRER" | "DEMO_ADMIN"> }> = [
  { prefix: "/repairs", roles: ["CUSTOMER"] },
  { prefix: "/repairer", roles: ["SIMULATED_REPAIRER"] },
  { prefix: "/admin", roles: ["DEMO_ADMIN"] },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const area = AREA_ROLES.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  if (!area) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (!area.roles.includes(session.role)) {
    // Wrong role: send them to their own home area instead of leaking the target exists.
    const home = session.role === "CUSTOMER" ? "/repairs" : session.role === "SIMULATED_REPAIRER" ? "/repairer" : "/admin/demo";
    return NextResponse.redirect(new URL(home, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/repairs/:path*", "/repairer/:path*", "/admin/:path*"],
};
