import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { DEVICE_CATALOG } from "@/domains/repairs/deviceCatalog";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function NewRepairPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/repairs/new" : "/");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Start a repair</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        You select the exact device model — the AI assessment never changes your selection.
      </p>
      <IntakeForm catalog={DEVICE_CATALOG.map(({ brand, model }) => ({ brand, model }))} />
    </div>
  );
}
