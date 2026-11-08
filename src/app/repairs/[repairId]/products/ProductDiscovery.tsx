"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState, SkeletonState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";
import type { DiscoveryResultRow } from "@/domains/products/service";

export function ProductDiscovery({
  repairId,
  initialResults,
  initialRun,
  selectedCandidateId,
}: {
  repairId: string;
  initialResults: DiscoveryResultRow[];
  initialRun: { status: string; query: string; createdAt: string } | null;
  selectedCandidateId: string | null;
}) {
  const [results, setResults] = useState<DiscoveryResultRow[]>(initialResults);
  const [, setRun] = useState(initialRun);
  const [selected, setSelected] = useState<string | null>(selectedCandidateId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/product-search`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { results?: DiscoveryResultRow[]; status?: string; message?: string }
        | null;
      if (!res.ok) {
        setError(body?.message ?? "Live product search is temporarily unavailable");
        return;
      }
      setResults(body?.results ?? []);
      setRun({ status: body?.status ?? "SUCCEEDED", query: "", createdAt: new Date().toISOString() });
    } catch {
      setError("Network error — please retry");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOne(candidateId: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/products/${candidateId}/refresh`);
      const body = (await res.json().catch(() => null)) as { result?: DiscoveryResultRow; message?: string } | null;
      const fresh = body?.result;
      if (!res.ok || !fresh) {
        setError(body?.message ?? "Refresh failed — values may have changed");
        return;
      }
      setResults((rows) => rows.map((r) => (r.candidateId === candidateId ? fresh : r)));
    } catch {
      setError("Network error — please retry");
    }
  }

  async function select(row: DiscoveryResultRow) {
    if (!row.offer) return;
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/product-selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: row.candidateId,
          channel3ProductId: row.channel3ProductId,
          offerDomain: row.offer.domain,
          expectedPriceMinor: row.offer.priceMinor,
          currency: row.offer.currency ?? "USD",
        }),
      });
      const body = (await res.json().catch(() => null)) as { selected?: unknown; message?: string; fresh?: DiscoveryResultRow } | null;
      if (res.status === 409) {
        if (body?.fresh) {
          setResults((rows) => rows.map((r) => (r.candidateId === row.candidateId ? body.fresh! : r)));
        }
        setNotice(body?.message ?? "The offer changed — review the fresh price and choose again");
        return;
      }
      if (!res.ok) {
        setError(body?.message ?? "Selection failed");
        return;
      }
      setSelected(row.candidateId);
      setNotice("Replacement-device comparison reference saved");
    } catch {
      setError("Network error — please retry");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Repair or replace?</h2>
          <p className="text-sm text-muted">
            Live replacement-device prices for your selected model — compare against the repair quotes before deciding.
          </p>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={loading}
          className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Searching…" : results.length > 0 ? "Search again" : "Find replacement devices"}
        </button>
      </div>

      <StatusBadge label="Candidate listings — Channel3 does not certify condition or authenticity" tone="neutral" />

      {error ? <ErrorState title="Live product search unavailable" description={error} retry={search} /> : null}
      {notice ? (
        <p role="status" className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonState lines={4} />
          <SkeletonState lines={4} />
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center">
          <p className="text-sm font-semibold">No matching replacement devices were returned</p>
          <p className="mt-1 text-sm text-muted">Try searching again. No placeholder listings are shown — results are always live.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {results.map((row) => (
            <li key={row.candidateId} className="rounded-card border border-line bg-surface p-4">
              <div className="flex gap-4">
                {row.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={row.imageUrl} alt="" className="h-24 w-24 rounded-card border border-line object-cover" />
                ) : (
                  <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-card border border-line bg-canvas text-xs text-muted">
                    no image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={row.title}>{row.title}</p>
                  {row.offer && row.offer.fresh ? (
                    <>
                      <p className="mt-1 text-base font-bold">
                        {row.offer.priceMinor !== null && row.offer.currency === "USD"
                          ? formatUsd(row.offer.priceMinor)
                          : "Price unavailable — cannot select"}
                      </p>
                      <p className="text-xs text-muted">
                        {row.offer.domain} · {row.offer.condition} · {row.offer.availability === "InStock" ? "in stock" : row.offer.availability.toLowerCase()}
                      </p>
                      <p className="text-xs text-muted">
                        observed {new Date(row.offer.observedAt).toLocaleTimeString("en-US")} — refreshed before display
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-warning">Offer not current — refresh to see a live price</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {row.offer?.fresh && row.offer.url ? (
                  <a
                    href={row.offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-control border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas"
                  >
                    Merchant page ↗
                  </a>
                ) : null}
                {row.offer?.fresh ? (
                  <button
                    type="button"
                    onClick={() => refreshOne(row.candidateId)}
                    className="rounded-control border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas"
                  >
                    Refresh offer
                  </button>
                ) : null}
                {row.selectionEligible && row.offer?.fresh ? (
                  <button
                    type="button"
                    onClick={() => select(row)}
                    className={
                      selected === row.candidateId
                        ? "rounded-control border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
                        : "rounded-control bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    }
                  >
                    {selected === row.candidateId ? "✓ Comparison reference" : "Use as replace-price reference"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
