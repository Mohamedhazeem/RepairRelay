import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";

export const dynamic = "force-dynamic";

export default async function RepairerPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/repairer" : "/");

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Workbench</h1>
        <SimulatedActorBadge />
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Assigned demo jobs will appear here. Repairer actors are simulated for this demonstration.
      </p>
      <div className="mt-8 rounded-card border border-dashed border-line bg-surface p-10 text-center text-muted">
        No assigned jobs yet. Job assignment arrives with the quotes slice.
      </div>
    </div>
  );
}
