import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { termsFromVersion } from "@/domains/contracts/service";
import { ContractReview, type PendingChange } from "./ContractReview";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function ContractPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

  const contract = await prisma.repairContract.findUnique({
    where: { repairRequestId: repairId },
    include: { versions: { orderBy: { versionNumber: "desc" } }, changeRequests: { where: { status: "PENDING" }, take: 1 } },
  });

  if (!contract) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">Repair Contract</h1>
        <p className="mt-2 text-sm text-muted">
          No contract yet — select a quote first.
        </p>
      </div>
    );
  }

  const currentVersion = contract.versions.find((v) => v.id === contract.currentVersionId) ?? contract.versions[0];
  const terms = termsFromVersion(currentVersion);

  let pendingChange: PendingChange | null = null;
  const pendingCr = contract.changeRequests[0];
  if (pendingCr) {
    const proposed = await prisma.contractVersion.findUnique({ where: { id: pendingCr.proposedVersionId } });
    if (proposed) {
      pendingChange = { id: pendingCr.id, reason: pendingCr.reason, proposed: termsFromVersion(proposed) };
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repair Contract</h1>
        <p className="text-sm text-muted">
          {repair.deviceBrand} {repair.deviceModel} · reference {repair.publicReference}
        </p>
      </div>
      <ContractReview
        contractId={contract.id}
        contractVersion={contract.version}
        status={contract.status}
        terms={terms}
        initialPendingChange={pendingChange}
      />
    </div>
  );
}
