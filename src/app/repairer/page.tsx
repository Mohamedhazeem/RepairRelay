import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { termsFromVersion } from "@/domains/contracts/service";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChangeRequestForm } from "./ChangeRequestForm";
import { EvidenceForm } from "./EvidenceForm";

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

  // Job + payment state per assignment.
  const jobViews = await Promise.all(
    assignments.map(async (q) => {
      const job = await prisma.repairJob.findUnique({
        where: { repairRequestId: q.repairRequestId },
        include: { submissions: { where: { status: "SUBMITTED" }, take: 1 } },
      });
      const payment = q.repairRequest.contract
        ? await prisma.paymentAttempt.findFirst({ where: { repairContractId: q.repairRequest.contract.id }, orderBy: { createdAt: "desc" } })
        : null;
      const intake = await prisma.uploadedAsset.findMany({ where: { repairRequestId: q.repairRequestId, assetKind: "INTAKE", deletedAt: null } });
      return { quote: q, job, payment, intake };
    }),
  );

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

      {jobViews.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center text-muted">
          No assigned jobs yet. They appear once a customer selects your quote and approves the contract.
        </div>
      ) : (
        jobViews.map(({ quote: q, job, payment, intake }) => {
          const contract = q.repairRequest.contract!;
          const latest = contract.versions[0];
          const terms = termsFromVersion(latest);
          const authorized = payment?.status === "AUTHORIZED";
          const canStart = !job && contract.status === "APPROVED" && authorized;
          const canSubmit = Boolean(job && (job.status === "IN_PROGRESS" || job.status === "REWORK_IN_PROGRESS") && authorized);
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
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={`Payment: ${payment?.status.replaceAll("_", " ") ?? "NONE"}`} tone={authorized ? "success" : "warning"} className="shrink-0" />
                  {job ? <StatusBadge label={job.status.replaceAll("_", " ")} tone={job.status === "CUSTOMER_REVIEW" ? "info" : "neutral"} className="shrink-0" /> : null}
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted">Component: </dt><dd className="inline font-medium">{terms.quote.componentLabel}</dd></div>
                <div><dt className="inline text-muted">Total: </dt><dd className="inline font-bold">{`$${(terms.totalMinor / 100).toFixed(2)}`}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-muted">Scope: </dt><dd className="inline">{terms.scopeText}</dd></div>
              </dl>

              {contract.status === "APPROVED" && !job ? (
                <div className="mt-4">
                  <ChangeRequestForm contractId={contract.id} contractVersion={contract.version} terms={terms} />
                </div>
              ) : null}
              {contract.status === "CHANGE_REQUESTED" ? (
                <p className="mt-4 text-sm text-warning">A change request is awaiting the customer&apos;s decision — work is paused.</p>
              ) : null}

              {job?.status === "CUSTOMER_REVIEW" ? (
                <p className="mt-4 text-sm text-info">Evidence submitted — awaiting the customer&apos;s accept / rework / cancel decision.</p>
              ) : (
                <div className="mt-5">
                  <EvidenceForm
                    repairId={q.repairRequestId}
                    job={job ? { jobId: job.id, status: job.status, contractVersionId: job.contractVersionId } : null}
                    category={q.repairRequest.repairCategory ?? "OTHER"}
                    intakeAssets={intake.map((a) => ({ id: a.id, width: a.width, height: a.height }))}
                    canStart={canStart}
                    canSubmit={canSubmit}
                  />
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
