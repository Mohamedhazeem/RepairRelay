import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { listQuotes } from "@/domains/quotes/service";
import { isObservationFresh } from "@/domains/products/service";
import { QuoteComparison } from "./QuoteComparison";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function QuotesPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

  const outcome = await listQuotes(prisma, repairId, guard.session.userId);
  const quotes = outcome.ok ? outcome.quotes : [];

  // Replacement-device benchmark from the selected Channel3 candidate (short-lived observation).
  let replaceBenchmark: { title: string; priceMinor: number; domain: string } | null = null;
  if (repair.selectedCandidateId) {
    const candidate = await prisma.productCandidate.findUnique({
      where: { id: repair.selectedCandidateId },
      include: { offerObservations: { orderBy: { observedAt: "desc" }, take: 1 } },
    });
    const obs = candidate?.offerObservations[0];
    if (candidate && obs && isObservationFresh(obs) && obs.priceMinor !== null) {
      replaceBenchmark = { title: candidate.title, priceMinor: obs.priceMinor, domain: obs.domain };
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare quotes</h1>
        <p className="text-sm text-muted">
          {repair.deviceBrand} {repair.deviceModel} · {repair.repairCategory?.replaceAll("_", " ").toLowerCase() ?? "category not set"} · reference {repair.publicReference}
        </p>
      </div>
      <QuoteComparison
        repairId={repairId}
        initialQuotes={quotes}
        expectedRepairVersion={repair.version}
        replaceBenchmark={replaceBenchmark}
      />
    </div>
  );
}
