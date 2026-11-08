import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { EnvironmentBanner } from "@/components/shell/EnvironmentBanner";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (session) {
    redirect(
      session.role === "CUSTOMER" ? "/repairs" : session.role === "SIMULATED_REPAIRER" ? "/repairer" : "/admin/demo",
    );
  }
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-card border border-line bg-surface p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <EnvironmentBanner />
        </div>
        <p className="mb-6 text-sm text-muted">
          Demo accounts only — there is no public signup in this MVP. Judge credentials are provided separately.
        </p>
        <LoginForm nextPath={next} />
      </div>
    </div>
  );
}
