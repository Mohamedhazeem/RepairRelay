import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function RepairsPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/repairs" : "/");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Your repair requests</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your payment is authorized first and captured only after you accept the submitted repair evidence.
      </p>
      <div className="mt-8 rounded-card border border-dashed border-line bg-surface p-10 text-center text-muted">
        No repair requests yet. Request intake arrives in the next slice.
      </div>
    </div>
  );
}
