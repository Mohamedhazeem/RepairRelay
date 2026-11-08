"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState } from "@/components/ui/states";

export type DecisionPanelProps = {
  repairId: string;
  contractVersionId: string;
  evidenceSubmissionId: string;
  jobStatus: string;
  aiCompleteness: string | null;
};

/** Explicit accept / rework / cancel. No default selection; confirm dialog for each. */
export function DecisionPanel({ repairId, contractVersionId, evidenceSubmissionId, jobStatus, aiCompleteness }: DecisionPanelProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"accept" | "rework" | "cancel" | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function decide(decision: "ACCEPT" | "REQUEST_REWORK" | "CANCEL") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/customer-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceSubmissionId,
          contractVersionId,
          decision,
          comment: decision === "REQUEST_REWORK" || comment ? comment : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { jobStatus?: string; message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? "Decision failed");
        return;
      }
      setNotice(
        decision === "ACCEPT"
          ? "Accepted — the payment capture is being confirmed"
          : decision === "REQUEST_REWORK"
            ? "Rework requested — the simulated repairer will resubmit evidence. Your authorization stays in place."
            : body?.jobStatus === "CANCELLED"
              ? "Repair cancelled (no authorization existed)."
              : "Cancellation requested — voiding the authorization; the repair is cancelled once the void is confirmed",
      );
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Network error — please retry");
    } finally {
      setPending(false);
    }
  }

  if (jobStatus !== "CUSTOMER_REVIEW") {
    if (notice) {
      return <p role="status" className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">{notice}</p>;
    }
    return null;
  }

  return (
    <section className="rounded-card border-2 border-brand/30 bg-brand-soft/40 p-6">
      <h2 className="text-lg font-semibold">Your decision</h2>
      {aiCompleteness ? (
        <p className="mt-1 text-xs text-muted">
          AI completeness: {aiCompleteness.toLowerCase()} — advisory only. You decide; the AI never accepts or pays.
        </p>
      ) : null}
      {error ? <div className="mt-3"><ErrorState title="Decision failed" description={error} /></div> : null}
      {notice ? <p role="status" className="mt-3 rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">{notice}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => setConfirming("accept")} className="rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Accept repair
        </button>
        <button type="button" onClick={() => setConfirming("rework")} className="rounded-control border border-warning/40 bg-surface px-4 py-2.5 text-sm font-semibold text-warning hover:bg-warning/5">
          Request rework
        </button>
        <button type="button" onClick={() => setConfirming("cancel")} className="rounded-control border border-danger/40 bg-surface px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5">
          Cancel repair
        </button>
      </div>

      {confirming === "rework" ? (
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">What needs rework? (required)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} minLength={10} className="w-full rounded-control border border-line px-3 py-2" placeholder="e.g. The brightness control still does not respond on the left edge." />
        </label>
      ) : null}

      {confirming ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm decision" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold">
              {confirming === "accept" ? "Accept the repair and authorize capture?" : confirming === "rework" ? "Request rework?" : "Cancel the repair and void the authorization?"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {confirming === "accept"
                ? "This explicitly authorizes capturing the held payment. Capture completes only after the provider confirms it."
                : confirming === "rework"
                  ? "No money moves. Your authorization stays in place while the repairer redoes the work (one rework cycle)."
                  : "The authorization will be voided — no money is charged. The repair is cancelled once the void is confirmed."}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirming(null)} className="rounded-control border border-line px-4 py-2 text-sm hover:bg-canvas">
                Go back
              </button>
              <button
                type="button"
                disabled={pending || (confirming === "rework" && comment.trim().length < 10)}
                onClick={() => decide(confirming === "accept" ? "ACCEPT" : confirming === "rework" ? "REQUEST_REWORK" : "CANCEL")}
                className={
                  confirming === "cancel"
                    ? "rounded-control bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    : "rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                }
              >
                {pending ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
