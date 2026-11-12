import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "@/lib/security/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE, type SessionUser } from "@/lib/auth/session";
import { jsonErrorBody, statusForCode, newTraceId } from "@/lib/http/errors";
import { SlidingWindowRateLimiter } from "@/lib/ratelimit";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const prisma = new PrismaClient();

/**
 * Sign-in throttle (ARCHITECTURE §7 security rules). Keyed per email so credential
 * stuffing against one seeded demo account cannot be distributed across IPs.
 *
 * Only *failed* authentications consume budget: a correct password is never
 * throttled, so repeated sign-ins (multi-role demo rehearsals, manual test
 * checklists) keep working. A successful sign-in clears the counter.
 *
 * Documented limitation: in-memory, single-instance — a shared store is required
 * before any multi-instance deployment.
 */
const loginLimiter = new SlidingWindowRateLimiter(10, 5 * 60_000);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const traceId = newTraceId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Body must be JSON", traceId), {
      status: statusForCode("VALIDATION_ERROR"),
    });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Enter a valid email and password", traceId), {
      status: statusForCode("VALIDATION_ERROR"),
    });
  }

  const { email, password } = parsed.data;

  // Throttle before touching the database so repeated guessing cannot be used to
  // amplify load. The response is the same envelope as any other failure.
  // `peek` does not consume budget — only a failed attempt below does.
  const limit = loginLimiter.peek(email.toLowerCase());
  if (!limit.allowed) {
    return NextResponse.json(
      jsonErrorBody("RATE_LIMITED", `Too many sign-in attempts — retry in ${limit.retryAfterSeconds}s`, traceId),
      { status: statusForCode("RATE_LIMITED") },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Uniform failure for unknown user / bad password / disabled account.
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    // A failed attempt consumes the budget; the response stays uniform so the
    // caller cannot distinguish "unknown user" from "wrong password".
    loginLimiter.record(email.toLowerCase());
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Invalid email or password", traceId), {
      status: statusForCode("UNAUTHENTICATED"),
    });
  }

  // Correct credentials clear any accumulated failure budget.
  loginLimiter.reset(email.toLowerCase());

  const sessionUser: SessionUser = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
  const token = await createSessionToken(sessionUser);
  const res = NextResponse.json({
    traceId,
    user: { email: user.email, displayName: user.displayName, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

export function GET() {
  return NextResponse.json(jsonErrorBody("VALIDATION_ERROR", "Use POST to sign in"), { status: 405 });
}
