import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { latestSearchRows } from "@/domains/products/service";
import { ProductDiscovery } from "./ProductDiscovery";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function ProductsPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

  const { rows, run } = await latestSearchRows(prisma, repairId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Find replacement options</h1>
          <p className="text-sm text-muted">
            {repair.deviceBrand} {repair.deviceModel} · reference {repair.publicReference}
          </p>
        </div>
      </div>
      <ProductDiscovery
        repairId={repairId}
        initialResults={rows}
        initialRun={run ? { status: run.status, query: run.query, createdAt: run.createdAt.toISOString() } : null}
        selectedCandidateId={repair.selectedCandidateId}
      />
    </div>
  );
}
