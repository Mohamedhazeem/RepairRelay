import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "@/lib/security/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE, type SessionUser } from "@/lib/auth/session";
import { jsonErrorBody, statusForCode, newTraceId } from "@/lib/http/errors";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const prisma = new PrismaClient();

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
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Uniform failure for unknown user / bad password / disabled account.
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(jsonErrorBody("UNAUTHENTICATED", "Invalid email or password", traceId), {
      status: statusForCode("UNAUTHENTICATED"),
    });
  }

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
