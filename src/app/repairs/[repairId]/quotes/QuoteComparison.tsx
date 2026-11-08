"use client";

import { useState } from "react";
import { SimulatedActorBadge } from "@/components/shell/SimulatedActorBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState, SkeletonState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";
import type { QuoteWithRepairer } from "@/domains/quotes/service";

export function QuoteComparison({
  repairId,
  initialQuotes,
  expectedRepairVersion,
  replaceBenchmark,
}: {
  repairId: string;
  initialQuotes: QuoteWithRepairer[];
  expectedRepairVersion: number;
  replaceBenchmark: { title: string; priceMinor: number; domain: string } | null;
}) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [version, setVersion] = useState(expectedRepairVersion);
  const [selectedId, setSelectedId] = useState<string | null>(initialQuotes.find((q) => q.status === "SELECTED")?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestQuotes() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/quotes`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { quotes?: QuoteWithRepairer[]; message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? "Could not request quotes");
        return;
      }
      setQuotes(body?.quotes ?? []);
    } catch {
      setError("Network error — please retry");
    } finally {
      setLoading(false);
    }
  }

  async function select(quote: QuoteWithRepairer) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/quotes/${quote.id}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRepairVersion: version }),
      });
      const body = (await res.json().catch(() => null)) as { quote?: QuoteWithRepairer; message?: string } | null;
      if (!res.ok || !body?.quote) {
        setError(body?.message ?? "Selection failed");
        if (res.status === 409) setVersion((v) => v + 1);
        return;
      }
      setSelectedId(quote.id);
      setQuotes((qs) =>
        qs.map((q) =>
          q.id === quote.id ? body.quote! : q.status === "GENERATED" ? { ...q, status: "SUPERSEDED", selectable: false } : q,
        ),
      );
      setVersion((v) => v + 1);
      setNotice("Quote selected — contract review arrives in the next step");
    } catch {
      setError("Network error — please retry");
    }
  }

  const lowestTotal = quotes.length > 0 ? Math.min(...quotes.filter((q) => q.selectable).map((q) => q.totalMinor)) : null;

  return (
    <div className="space-y-4">
      {replaceBenchmark ? (
        <div className="rounded-card border border-line bg-surface p-4 text-sm">
          <span className="font-semibold">Replace instead? </span>
          Current replacement-device reference: {replaceBenchmark.title} —{" "}
          <span className="font-bold">{formatUsd(replaceBenchmark.priceMinor)}</span>{" "}
          <span className="text-muted">({replaceBenchmark.domain}, observed earlier — refresh on the discovery page for a current price)</span>
        </div>
      ) : null}

      {error ? <ErrorState title="Quote action failed" description={error} /> : null}
      {notice ? (
        <p role="status" className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonState lines={5} />
          <SkeletonState lines={5} />
          <SkeletonState lines={5} />
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center">
          <p className="text-sm font-semibold">No quotes yet</p>
          <p className="mt-1 text-sm text-muted">
            Three simulated repairers will quote itemized amounts against your request. Values are illustrative demo data.
          </p>
          <button
            type="button"
            onClick={requestQuotes}
            className="mt-4 rounded-control bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Request quotes from simulated repairers
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-3">
          {quotes.map((quote) => (
            <li
              key={quote.id}
              className={
                selectedId === quote.id
                  ? "rounded-card border-2 border-brand bg-surface p-5"
                  : "rounded-card border border-line bg-surface p-5"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <SimulatedActorBadge />
                {lowestTotal !== null && quote.totalMinor === lowestTotal && quote.selectable ? (
                  <StatusBadge label="Lowest total" tone="brand" />
                ) : null}
              </div>
              <p className="mt-2 text-sm font-semibold">{quote.repairer.displayName}</p>
              <p className="text-xs text-muted">{quote.repairer.demoDescription}</p>

              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Part charge</dt><dd>{formatUsd(quote.partChargeMinor)}{quote.partChargeMinor === 0 ? " (no parts)" : ""}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Labour</dt><dd>{formatUsd(quote.labourMinor)}</dd></div>
                <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Total</dt><dd>{formatUsd(quote.totalMinor)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Warranty</dt><dd>{quote.warrantyDays ? `${quote.warrantyDays} days` : "None"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Turnaround</dt><dd>~{quote.estimatedDurationHours}h</dd></div>
              </dl>

              <p className="mt-3 text-xs text-muted"><span className="font-medium">Component:</span> {quote.componentLabel}</p>
              <p className="text-xs text-muted"><span className="font-medium">Attestation:</span> {quote.compatibilityAttestation.replaceAll("_", " ").toLowerCase()} (simulated)</p>
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer font-medium text-ink">Scope & exclusions</summary>
                <p className="mt-1">{quote.scopeText}</p>
                <p className="mt-1">{quote.exclusionsText}</p>
                <p className="mt-1">{quote.warrantyText}</p>
              </details>
              <p className="mt-2 text-xs text-muted">Valid until {new Date(quote.validUntil).toLocaleString("en-US")}</p>

              <button
                type="button"
                disabled={!quote.selectable}
                onClick={() => select(quote)}
                className={
                  selectedId === quote.id
                    ? "mt-3 w-full rounded-control border border-brand bg-brand-soft px-3 py-2 text-sm font-semibold text-brand"
                    : "mt-3 w-full rounded-control bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                }
              >
                {selectedId === quote.id ? "✓ Selected" : quote.expired ? "Expired" : quote.status === "SUPERSEDED" ? "Not selected" : "Select this quote"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {quotes.length > 0 ? (
        <p className="text-xs text-muted">
          All repairers and quote values are simulated for this demonstration. The Channel3 replacement-device price
          above is a retail reference, not the repairer&apos;s part charge.
        </p>
      ) : null}
    </div>
  );
}
