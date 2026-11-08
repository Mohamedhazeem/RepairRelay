"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoResetButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/demo-reset", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? "Reset failed");
        return;
      }
      setResult(body?.message ?? "Demo data wiped and accounts re-seeded");
      router.refresh();
    } catch {
      setError("Network error — please retry");
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-card border border-danger/30 bg-danger/5 p-5">
      <h2 className="text-sm font-semibold text-danger">Demo data reset</h2>
      <p className="mt-1 text-sm text-muted">
        Wipes all transactions, uploaded assets and audit events, then re-seeds the demo accounts. Provider results are
        never faked — the next demo run performs fresh, real API calls.
      </p>
      {result ? <p role="status" className="mt-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{result}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {confirming ? (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={pending} onClick={reset} className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Resetting…" : "Yes, wipe everything"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-control border border-line px-4 py-2 text-sm hover:bg-canvas">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-3 rounded-control border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5">
          Reset demo data
        </button>
      )}
    </div>
  );
}
