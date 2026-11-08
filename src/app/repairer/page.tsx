import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { termsFromVersion } from "@/domains/contracts/service";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChangeRequestForm } from "./ChangeRequestForm";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function RepairerPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "SIMULATED_REPAIRER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/repairer" : "/");

  const repairer = await prisma.simulatedRepairer.findUnique({ where: { userId: guard.session.userId } });
  const selectedQuotes = repairer
    ? await prisma.repairQuote.findMany({
        where: { repairerId: repairer.id, status: "SELECTED" },
        include: {
          repairRequest: { include: { contract: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } } } },
        },
      })
    : [];
  const assignments = selectedQuotes.filter((q) => q.repairRequest.contract);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Workbench</h1>
          <SimulatedActorBadge />
        </div>
        <p className="mt-2 max-w-2xl text-muted">
          Assigned demo jobs and approved contracts appear here. Repairer actors are simulated for this demonstration.
        </p>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center text-muted">
          No assigned jobs yet. They appear once a customer selects your quote and approves the contract.
        </div>
      ) : (
        assignments.map((q) => {
          const contract = q.repairRequest.contract!;
          const latest = contract.versions[0];
          const terms = termsFromVersion(latest);
          return (
            <section key={contract.id} className="rounded-card border border-line bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {q.repairRequest.deviceBrand} {q.repairRequest.deviceModel}
                  </h2>
                  <p className="text-sm text-muted">
                    Reference {q.repairRequest.publicReference} · contract v{latest.versionNumber} ·{" "}
                    {contract.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                <StatusBadge label={contract.status.replaceAll("_", " ")} tone={contract.status === "APPROVED" ? "success" : "warning"} />
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted">Component: </dt><dd className="inline font-medium">{terms.quote.componentLabel}</dd></div>
                <div><dt className="inline text-muted">Total: </dt><dd className="inline font-bold">{`$${(terms.totalMinor / 100).toFixed(2)}`}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-muted">Scope: </dt><dd className="inline">{terms.scopeText}</dd></div>
              </dl>
              {contract.status === "APPROVED" ? (
                <div className="mt-4">
                  <ChangeRequestForm contractId={contract.id} contractVersion={contract.version} terms={terms} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-warning">
                  {contract.status === "CHANGE_REQUESTED"
                    ? "A change request is awaiting the customer's decision — work is paused."
                    : "Waiting for the customer to approve the contract."}
                </p>
              )}
              <p className="mt-3 text-xs text-muted">
                Repair work and evidence submission arrive with the workbench slice; payment must be authorized first.
              </p>
            </section>
          );
        })
      )}
    </div>
  );
}
