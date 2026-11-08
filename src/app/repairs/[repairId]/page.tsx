import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DiagnosisPanel, type DiagnosisView } from "./DiagnosisPanel";
import { DecisionPanel } from "./DecisionPanel";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function RepairDetailPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: {
      assets: { where: { assetKind: "INTAKE", deletedAt: null }, orderBy: { createdAt: "asc" } },
      diagnosisReports: { orderBy: { createdAt: "desc" }, take: 1 },
      jobs: { include: { submissions: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true, assessments: { orderBy: { createdAt: "desc" }, take: 1 } } } } },
    },
  });
  if (!repair || repair.customerId !== guard.session.userId) notFound();
  const submission = repair.jobs[0]?.submissions[0] ?? null;

  const latest = repair.diagnosisReports[0];
  const diagnosis: DiagnosisView | null = latest
    ? {
        deviceModelAssessment: latest.deviceModelAssessment as DiagnosisView["deviceModelAssessment"],
        visibleObservations: latest.visibleObservations as DiagnosisView["visibleObservations"],
        suspectedCauses: latest.suspectedCauses as DiagnosisView["suspectedCauses"],
        likelyRepairCategory: latest.likelyRepairCategory ?? "—",
        overallConfidence: latest.confidenceBand,
        unknowns: (latest.unknowns as string[]) ?? [],
        recommendedQuestions: (latest.recommendedQuestions as string[]) ?? [],
        limitations: (latest.limitations as string[]) ?? [],
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {repair.deviceBrand} {repair.deviceModel}
          </h1>
          <p className="text-sm text-muted">
            Reference {repair.publicReference} · created {repair.createdAt.toLocaleDateString("en-US")}
          </p>
        </div>
        <StatusBadge label={repair.status.replaceAll("_", " ")} tone="neutral" />
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Reported symptoms</h2>
        <p className="mt-2 whitespace-pre-wrap">{repair.symptoms}</p>
        {repair.repairCategory ? (
          <p className="mt-2 text-sm text-muted">Repair category: {repair.repairCategory.replaceAll("_", " ").toLowerCase()}</p>
        ) : null}
        {repair.deviceModelConfidence === "UNKNOWN" ? (
          <p className="mt-2 text-sm text-warning">Model not verified — exact part search is unavailable for this request.</p>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your photos</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {repair.assets.map((a) => (
            <li key={a.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/assets/${a.id}`}
                alt={`Uploaded intake photo (${a.width}×${a.height})`}
                className="h-28 w-full rounded-card border border-line object-cover"
              />
            </li>
          ))}
        </ul>
      </section>

      {submission ? (
        <DecisionPanel
          repairId={repair.id}
          contractVersionId={submission.contractVersionId}
          evidenceSubmissionId={submission.id}
          jobStatus={repair.jobs[0].status}
          aiCompleteness={submission.assessments[0]?.completeness ?? null}
        />
      ) : null}

      {submission ? (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Submitted repair evidence</h2>
          <p className="mt-1 text-sm">
            Component: <span className="font-medium">{submission.componentDeclaration}</span>
            {submission.componentIdentityBasis === "TECHNICIAN_DECLARATION" ? (
              <span className="ml-1 text-xs text-muted">(technician-declared identity — not photo-verified)</span>
            ) : null}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {submission.assets.map((a) => (
              <li key={a.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${a.uploadedAssetId}`} alt={`Evidence photo (${a.evidenceType.toLowerCase()})`} className="h-28 w-full rounded-card border border-line object-cover" />
                <p className="mt-1 text-center text-xs text-muted">{a.evidenceType.replaceAll("_", " ").toLowerCase()}</p>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-sm">
            {(submission.functionalChecksJson as Array<{ check: string; result: string }>).map((c) => (
              <li key={c.check}>
                {c.check.replaceAll("_", " ")}: <span className={c.result === "PASS" ? "font-semibold text-success" : "font-semibold text-danger"}>{c.result}</span>
              </li>
            ))}
          </ul>
          {submission.notes ? <p className="mt-2 text-sm text-muted">Repairer note: {submission.notes}</p> : null}
          {(() => {
            const assessment = submission.assessments[0];
            if (!assessment) return null;
            const flags = (assessment.flags as Array<{ code: string; severity: string; message: string }>) ?? [];
            return (
              <div className="mt-3 rounded-control border border-info/30 bg-info/5 p-3 text-xs">
                <p className="font-semibold text-info">AI completeness check: {assessment.completeness.toLowerCase()} — advisory only, it does not certify the repair</p>
                {flags.map((f, i) => (
                  <p key={i} className="mt-1 text-muted">{f.message}</p>
                ))}
                {assessment.completeness === "UNAVAILABLE" ? (
                  <p className="mt-1 text-muted">AI check unavailable — you can review the evidence and decide yourself.</p>
                ) : null}
              </div>
            );
          })()}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">AI assessment</h2>
        <DiagnosisPanel
          repairId={repair.id}
          diagnosis={diagnosis}
          hasImages={repair.assets.length > 0}
          canRunDiagnosis
        />
      </section>

      <p className="text-sm text-muted">
        Next steps:{" "}
        <Link href={`/repairs/${repair.id}/products`} className="font-medium text-brand hover:underline">
          replacement-device prices →
        </Link>{" "}
        ·{" "}
        <Link href={`/repairs/${repair.id}/quotes`} className="font-medium text-brand hover:underline">
          compare repairer quotes →
        </Link>
        {repair.selectedQuoteId ? (
          <>
            {" "}·{" "}
            <Link href={`/repairs/${repair.id}/contract`} className="font-medium text-brand hover:underline">
              review contract →
            </Link>
          </>
        ) : null}
        {repair.status === "COMPLETED" ? (
          <>
            {" "}·{" "}
            <Link href={`/repairs/${repair.id}/passport`} className="font-medium text-brand hover:underline">
              Repair Passport →
            </Link>
          </>
        ) : null}
      </p>
      <Link href="/repairs" className="text-sm font-medium text-brand hover:underline">
        ← Back to repairs
      </Link>
    </div>
  );
}
