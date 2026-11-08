"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";
import type { ContractTerms } from "@/domains/contracts/service";

/** Simulated repairer workbench form: propose a formal contract change (server computes the diff). */
export function ChangeRequestForm({
  contractId,
  contractVersion,
  terms,
}: {
  contractId: string;
  contractVersion: number;
  terms: ContractTerms;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [part, setPart] = useState(String(terms.quote.partChargeMinor / 100));
  const [labour, setLabour] = useState(String(terms.quote.labourMinor / 100));
  const [warrantyDays, setWarrantyDays] = useState(String(terms.quote.warrantyDays ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toMinor(value: string): number | null {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
    return Math.round(Number(value) * 100);
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    const partMinor = toMinor(part);
    const labourMinor = toMinor(labour);
    if (partMinor === null || labourMinor === null) {
      setError("Part charge and labour must be plain amounts like 59.49");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedContractVersion: contractVersion,
          reason,
          proposedChanges: {
            partChargeMinor: partMinor,
            labourMinor,
            warrantyDays: Number(warrantyDays) || 0,
          },
        }),
      });
      const body = (await res.json().catch(() => null)) as { after?: { totalMinor: number }; message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? "Change request failed");
        return;
      }
      setSuccess(`Change proposed — new total ${formatUsd(body?.after?.totalMinor ?? 0)} awaits customer approval. Work pauses until they decide.`);
      router.refresh();
    } catch {
      setError("Network error — please retry");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Request a contract change</h3>
      <p className="text-xs text-muted">
        The customer must approve any change. The original contract version stays in history and work pauses while they decide.
      </p>
      {error ? <ErrorState title="Change request failed" description={error} /> : null}
      {success ? (
        <p role="status" className="rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {success}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Reason (required)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          minLength={10}
          maxLength={1000}
          placeholder="e.g. The OLED assembly from the declared supplier is out of stock; proposing an equivalent assembly with adjusted part charge."
          className="w-full rounded-control border border-line px-3 py-2"
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Part charge ($)</span>
          <input value={part} onChange={(e) => setPart(e.target.value)} inputMode="decimal" className="w-full rounded-control border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Labour ($)</span>
          <input value={labour} onChange={(e) => setLabour(e.target.value)} inputMode="decimal" className="w-full rounded-control border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Warranty (days)</span>
          <input value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)} inputMode="numeric" className="w-full rounded-control border border-line px-3 py-2" />
        </label>
      </div>
      <button
        type="button"
        disabled={pending || reason.trim().length < 10}
        onClick={submit}
        className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Propose change for customer approval"}
      </button>
    </div>
  );
}
