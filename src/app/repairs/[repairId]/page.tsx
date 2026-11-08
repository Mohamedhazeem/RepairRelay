import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DiagnosisPanel, type DiagnosisView } from "./DiagnosisPanel";

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
    },
  });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

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
        Next step:{" "}
        <Link href={`/repairs/${repair.id}/products`} className="font-medium text-brand hover:underline">
          compare live replacement-device prices (repair vs replace) →
        </Link>
      </p>
      <Link href="/repairs" className="text-sm font-medium text-brand hover:underline">
        ← Back to repairs
      </Link>
    </div>
  );
}
