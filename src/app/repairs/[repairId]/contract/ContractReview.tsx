"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";
import type { ContractTerms } from "@/domains/contracts/service";

export type PendingChange = {
  id: string;
  reason: string;
  proposed: ContractTerms;
};

export function ContractReview({
  contractId,
  contractVersion,
  status,
  terms,
  initialPendingChange,
  repairIdParam,
}: {
  contractId: string;
  contractVersion: number;
  status: string;
  terms: ContractTerms | null;
  initialPendingChange: PendingChange | null;
  repairIdParam: string;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(contractVersion);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(initialPendingChange);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<"approve" | "approveChange" | "rejectChange" | null>(null);

  async function post(url: string, body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        setError((data?.message as string) ?? "Action failed");
        if (res.status === 409) setVersion((v) => v + 1);
        return null;
      }
      return data;
    } catch {
      setError("Network error — please retry");
      return null;
    } finally {
      setPending(false);
      setConfirming(null);
    }
  }

  async function approve() {
    const data = await post(`/api/contracts/${contractId}/approve`, { expectedContractVersion: version, confirmed: true });
    if (data) {
      setCurrentStatus("APPROVED");
      setVersion((v) => v + 1);
      setNotice("Contract approved — PayPal authorization is the next step");
      router.refresh();
    }
  }

  async function decideChange(decision: "APPROVE" | "REJECT") {
    if (!pendingChange) return;
    const data = await post(`/api/change-requests/${pendingChange.id}/decision`, { decision, expectedContractVersion: version });
    if (data) {
      setNotice(
        decision === "APPROVE"
          ? "Change approved — the new contract version is now in force"
          : "Change rejected — the previous approved contract remains in force",
      );
      setPendingChange(null);
      setCurrentStatus("APPROVED");
      setVersion((v) => v + 1);
      router.refresh();
    }
  }

  if (!terms) {
    return <ErrorState title="Contract unavailable" description="No contract version found." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={currentStatus.replaceAll("_", " ")} tone={currentStatus === "APPROVED" ? "success" : "warning"} className="shrink-0" />
        <span className="text-sm text-muted">
          Version {terms.versionNumber} · created {new Date(terms.createdAt).toLocaleString("en-US")}
        </span>
        <SimulatedActorBadge />
        <StatusBadge label="PAYPAL SANDBOX" tone="warning" className="shrink-0" />
      </div>

      {error ? <ErrorState title="Action failed" description={error} /> : null}
      {notice ? (
        <p role="status" className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          {notice}
        </p>
      ) : null}

      {pendingChange ? (
        <section className="rounded-card border-2 border-warning/40 bg-warning/5 p-5">
          <h2 className="text-lg font-semibold text-warning">Change request awaiting your decision</h2>
          <p className="mt-1 text-sm text-muted">Reason: {pendingChange.reason}</p>
          <ContractDiff before={terms} after={pendingChange.proposed} />
          <p className="mt-3 text-sm">
            New total: <span className="font-bold">{formatUsd(pendingChange.proposed.totalMinor)}</span>
            {pendingChange.proposed.totalMinor !== terms.totalMinor ? (
              <span className="text-warning"> (was {formatUsd(terms.totalMinor)})</span>
            ) : null}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming("approveChange")}
              className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Approve change
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming("rejectChange")}
              className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
            >
              Reject change
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Approving an amount change before payment simply updates the contract; after a PayPal authorization exists,
            the old authorization is voided and a new approval + authorization is required for the new amount.
          </p>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">Repair Contract — v{terms.versionNumber}</h2>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Repairer</dt><dd>{terms.quote.repairerDisplayName} (simulated)</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Component</dt><dd>{terms.quote.componentLabel}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Attestation</dt><dd>{terms.quote.compatibilityAttestation.replaceAll("_", " ").toLowerCase()} (simulated)</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Part charge</dt><dd>{formatUsd(terms.quote.partChargeMinor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Labour</dt><dd>{formatUsd(terms.quote.labourMinor)}</dd></div>
          {terms.quote.feesMinor > 0 ? <div className="flex justify-between"><dt className="text-muted">Fees</dt><dd>{formatUsd(terms.quote.feesMinor)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Total</dt><dd>{formatUsd(terms.totalMinor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Warranty</dt><dd>{terms.quote.warrantyDays ? `${terms.quote.warrantyDays} days` : "None"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Turnaround</dt><dd>~{terms.quote.estimatedDurationHours}h</dd></div>
        </dl>
        <div className="mt-4 space-y-1 text-xs text-muted">
          <p><span className="font-medium text-ink">Scope:</span> {terms.scopeText}</p>
          <p><span className="font-medium text-ink">Exclusions:</span> {terms.quote.exclusionsText}</p>
          <p><span className="font-medium text-ink">Warranty:</span> {terms.warrantyText}</p>
          {terms.productReference ? (
            <p>
              <span className="font-medium text-ink">Replace-benchmark (historical):</span> {terms.productReference.title} at{" "}
              {formatUsd(terms.productReference.priceMinor)} via {terms.productReference.domain}, observed{" "}
              {new Date(terms.productReference.observedAt).toLocaleString("en-US")} — {terms.productReference.note}
            </p>
          ) : null}
          <p><span className="font-medium text-ink">Diagnosis caveat:</span> the AI assessment is advisory; physical inspection may change the repair scope.</p>
        </div>
      </section>

      <section className="rounded-card border border-info/30 bg-info/5 p-5 text-sm">
        <p>
          PayPal will <span className="font-semibold">authorize</span> {formatUsd(terms.totalMinor)} now. Capture is
          requested only after you accept the completed repair evidence. <span className="font-semibold">This is not escrow</span>{" "}
          and does not pay the simulated repairer.
        </p>
      </section>

      {currentStatus === "AWAITING_CUSTOMER_APPROVAL" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming("approve")}
          className="w-full rounded-control bg-brand px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Approve repair terms — {formatUsd(terms.totalMinor)}
        </button>
      ) : null}
      {currentStatus === "APPROVED" ? (
        <a
          href={`/repairs/${repairIdParam}/payment`}
          className="block w-full rounded-control bg-brand px-6 py-3 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          Continue to PayPal authorization →
        </a>
      ) : null}

      {confirming ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm action" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold">
              {confirming === "approve" ? "Approve these repair terms?" : confirming === "approveChange" ? "Approve the proposed change?" : "Reject the proposed change?"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {confirming === "approve"
                ? `You approve version ${terms.versionNumber} at ${formatUsd(terms.totalMinor)}. PayPal authorization happens next and capture only after you accept the completed work.`
                : confirming === "approveChange"
                  ? "The proposed version becomes the current contract. If the total changed and an authorization already exists, it must be voided and re-authorized for the new amount."
                  : "The previously approved contract version remains in force."}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirming(null)} className="rounded-control border border-line px-4 py-2 text-sm hover:bg-canvas">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => (confirming === "approve" ? approve() : decideChange(confirming === "approveChange" ? "APPROVE" : "REJECT"))}
                className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContractDiff({ before, after }: { before: ContractTerms; after: ContractTerms }) {
  const rows: Array<[string, string, string]> = [];
  const b = before.quote;
  const a = after.quote;
  if (b.componentLabel !== a.componentLabel) rows.push(["Component", b.componentLabel, a.componentLabel]);
  if (b.partChargeMinor !== a.partChargeMinor) rows.push(["Part charge", formatUsd(b.partChargeMinor), formatUsd(a.partChargeMinor)]);
  if (b.labourMinor !== a.labourMinor) rows.push(["Labour", formatUsd(b.labourMinor), formatUsd(a.labourMinor)]);
  if (b.warrantyDays !== a.warrantyDays) rows.push(["Warranty", `${b.warrantyDays ?? 0} days`, `${a.warrantyDays ?? 0} days`]);
  if (b.estimatedDurationHours !== a.estimatedDurationHours) rows.push(["Turnaround", `~${b.estimatedDurationHours}h`, `~${a.estimatedDurationHours}h`]);
  if (b.scopeText !== a.scopeText) rows.push(["Scope", b.scopeText, a.scopeText]);
  if (b.totalMinor !== a.totalMinor) rows.push(["Total", formatUsd(b.totalMinor), formatUsd(a.totalMinor)]);
  if (rows.length === 0) return null;
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-1">Field</th>
          <th className="py-1">Before</th>
          <th className="py-1">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([field, beforeVal, afterVal]) => (
          <tr key={field} className="border-t border-line">
            <td className="py-1.5 font-medium">{field}</td>
            <td className="py-1.5 text-muted">{beforeVal}</td>
            <td className="py-1.5 font-semibold">{afterVal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
