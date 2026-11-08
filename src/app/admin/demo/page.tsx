import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { DemoResetButton } from "./DemoResetButton";

export const dynamic = "force-dynamic";

export default async function DemoAdminPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "DEMO_ADMIN");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/admin/demo" : "/");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Demo operator</h1>
            <p className="mt-2 max-w-2xl text-muted">
        Demo-operator tools. No access to provider secrets.
      </p>
      <div className="mt-8 max-w-xl">
        <DemoResetButton />
      </div>
    </div>
  );
}
