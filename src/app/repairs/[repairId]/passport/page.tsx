import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { getPassport } from "@/domains/passport/service";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export default async function PassportPage({ params }: { params: Promise<{ repairId: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login" : "/");

  const { repairId } = await params;
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== guard.session.userId) notFound();

  const outcome = await getPassport(prisma, repairId, guard.session.userId);
  if (!outcome.ok) notFound();

  if (!outcome.passportAvailable) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Repair Passport</h1>
        <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center">
          <p className="text-sm font-semibold">Passport not issued yet</p>
          <p className="mt-1 text-sm text-muted">{outcome.reason}</p>
          <p className="mt-1 text-xs text-muted">Current status: {outcome.repairStatus.replaceAll("_", " ").toLowerCase()}</p>
        </div>
        <Link href={`/repairs/${repairId}`} className="text-sm font-medium text-brand hover:underline">
          ← Back to the repair
        </Link>
      </div>
    );
  }

  const p = outcome.passport;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repair Passport</h1>
          <p className="text-sm text-muted">
            {p.device.brand} {p.device.model} · reference {p.publicReference}
          </p>
        </div>
        <StatusBadge label="COMPLETED" tone="success" />
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Payment receipt</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Captured amount</dt><dd className="text-base font-bold">{formatUsd(p.payment.amountMinor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Provider</dt><dd>{p.payment.provider}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Capture reference</dt><dd className="font-mono text-xs">{p.payment.captureId}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Authorization reference</dt><dd className="font-mono text-xs">{p.payment.authorizationId}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Captured at</dt><dd>{new Date(p.payment.capturedAt).toLocaleString("en-US")}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Sandbox capture to the platform merchant — this is not escrow and does not pay the simulated repairer.</p>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Approved contract</h2>
          <span className="text-xs text-muted">Version {p.contract.currentVersionNumber}</span>
        </div>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Repairer</dt><dd>{p.repairer.displayName} (simulated)</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="font-bold">{formatUsd(p.contract.totalMinor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Warranty</dt><dd>{p.contract.terms.quote.warrantyDays ? `${p.contract.terms.quote.warrantyDays} days` : "None"}</dd></div>
        </dl>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {p.contract.history.map((h) => (
            <li key={h.versionNumber}>
              v{h.versionNumber} — {formatUsd(h.totalMinor)}
              {h.changeReason ? ` — changed: ${h.changeReason}` : ""}
              {h.approvedAt ? ` — approved ${new Date(h.approvedAt).toLocaleString("en-US")}` : " — not approved"}
            </li>
          ))}
        </ul>
        {p.productReference ? (
          <p className="mt-3 rounded-control border border-line bg-canvas px-3 py-2 text-xs text-muted">
            <span className="font-medium text-ink">Replacement-device comparison (historical):</span> {p.productReference.title} at{" "}
            {formatUsd(p.productReference.priceMinor)} via {p.productReference.domain}. {p.productReference.label}
          </p>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Repairer declaration</h2>
          <SimulatedActorBadge />
        </div>
        <p className="mt-2 text-sm">{p.repairer.componentDeclaration}</p>
        <p className="mt-1 text-xs text-muted">Identity basis: {p.repairer.componentIdentityBasis}</p>
        {p.repairer.note ? <p className="mt-1 text-xs text-muted">Note: {p.repairer.note}</p> : null}
        {p.evidence.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {p.evidence.map((e) => (
              <li key={e.assetId}>
                {e.available ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`/api/assets/${e.assetId}`} alt={`Evidence (${e.evidenceType.toLowerCase()})`} className="h-24 w-full rounded-card border border-line object-cover" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-card border border-dashed border-line bg-canvas text-xs text-muted">unavailable</div>
                )}
                <p className="mt-1 text-center text-xs text-muted">{e.evidenceType.replaceAll("_", " ").toLowerCase()}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-3 space-y-1 text-sm">
          {p.functionalChecks.map((c) => (
            <li key={c.check}>
              {c.check.replaceAll("_", " ")}: <span className={c.result === "PASS" ? "font-semibold text-success" : "font-semibold text-danger"}>{c.result}</span>
            </li>
          ))}
        </ul>
      </section>

      {p.diagnosis ? (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Original AI assessment (advisory)</h2>
          <p className="mt-2 text-sm">Likely category at intake: {p.diagnosis.likelyRepairCategory} · confidence {p.diagnosis.confidenceBand}</p>
          <p className="mt-1 text-xs text-muted">{p.diagnosis.caveat}</p>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Transaction timeline</h2>
        <ol className="mt-3 space-y-2 border-l border-line pl-4 text-sm">
          {p.timeline.map((e, i) => (
            <li key={i} className="relative">
              <span aria-hidden="true" className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brand" />
              <span className="text-xs text-muted">{new Date(e.at).toLocaleString("en-US")}</span> — {e.label}
              <span className="ml-1 text-xs text-muted">({e.actorType.toLowerCase().replaceAll("_", " ")})</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-muted">
        This passport records the agreed and performed work for this demonstration transaction. It is not an OEM
        certification, a compatibility certificate, or a guarantee beyond the contract terms.
      </p>
      <Link href={`/repairs/${repairId}`} className="text-sm font-medium text-brand hover:underline">
        ← Back to the repair
      </Link>
    </div>
  );
}
