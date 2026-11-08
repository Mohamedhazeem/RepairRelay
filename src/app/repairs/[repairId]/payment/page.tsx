import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { getPaymentView } from "@/domains/payments/service";
import { PaymentPanel } from "./PaymentPanel";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function PaymentPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

  const view = await getPaymentView(prisma, repairId, guard.session.userId);
  if (!view?.contract) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Payment</h1>
        <p className="mt-2 text-sm text-muted">The contract must be approved before payment can begin.</p>
      </div>
    );
  }

  // Repairer display name comes from the contract snapshot.
  const contractRow = await prisma.repairContract.findUnique({
    where: { id: view.contract.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const snapshot = (contractRow?.versions[0]?.quoteSnapshotJson ?? null) as { repairerDisplayName?: string } | null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Authorize payment</h1>
        <p className="text-sm text-muted">
          {repair.deviceBrand} {repair.deviceModel} · reference {repair.publicReference}
        </p>
      </div>
      <PaymentPanel
        contractId={view.contract.id}
        contractVersion={view.contract.version}
        totalMinor={view.contract.totalMinor}
        repairerName={snapshot?.repairerDisplayName ?? "Simulated repairer"}
        initialStatus={view.attempt?.status ?? null}
        initialOrderId={view.attempt?.paypalOrderId ?? null}
      />
      <Link href={`/repairs/${repairId}/contract`} className="text-sm font-medium text-brand hover:underline">
        ← Back to contract
      </Link>
    </div>
  );
}
