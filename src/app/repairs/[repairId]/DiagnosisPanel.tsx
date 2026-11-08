"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState, SkeletonState } from "@/components/ui/states";

export type DiagnosisView = {
  deviceModelAssessment: { value: string; source: string; needsConfirmation: boolean };
  visibleObservations: Array<{ observation: string; evidence: string; certainty: string }>;
  suspectedCauses: Array<{ cause: string; certainty: string; basis: string }>;
  likelyRepairCategory: string;
  overallConfidence: string;
  unknowns: string[];
  recommendedQuestions: string[];
  limitations: string[];
};

const BAND_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "warning",
  UNASSESSED: "neutral",
};

export function DiagnosisPanel({
  repairId,
  diagnosis,
  hasImages,
  canRunDiagnosis,
}: {
  repairId: string;
  diagnosis: DiagnosisView | null;
  hasImages: boolean;
  canRunDiagnosis: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/repairs/${repairId}/diagnosis`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "AI analysis is unavailable");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — your request is saved, please retry");
    } finally {
      setPending(false);
    }
  }

  if (pending) {
    return (
      <div aria-live="polite">
        <SkeletonState lines={4} />
        <p className="mt-2 text-sm text-muted">AI-assisted assessment in progress — this usually takes under a minute…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorState title="AI assessment unavailable" description={error} retry={runDiagnosis} />
        <p className="text-sm text-muted">
          Your draft and photos are safe. You can retry, or continue with your own description.
        </p>
      </div>
    );
  }

  if (!diagnosis) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
        <p className="text-sm text-muted">
          {hasImages
            ? "No AI assessment yet."
            : "Add at least one photo, then request the AI-assisted assessment."}
        </p>
        {canRunDiagnosis && hasImages ? (
          <button
            type="button"
            onClick={runDiagnosis}
            className="mt-4 rounded-control bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Run AI assessment
          </button>
        ) : null}
        <p className="mt-3 text-xs text-muted">You can continue without AI — the repair category can be selected manually.</p>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge label="AI-assisted assessment — review before proceeding" tone="info" icon="✦" />
        <StatusBadge label={`Confidence: ${diagnosis.overallConfidence}`} tone={BAND_TONE[diagnosis.overallConfidence] ?? "neutral"} />
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Visible observations</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {diagnosis.visibleObservations.map((o, i) => (
            <li key={i}>
              {o.observation} <span className="text-xs text-muted">({o.certainty.toLowerCase()} certainty)</span>
            </li>
          ))}
          {diagnosis.visibleObservations.length === 0 ? <li className="text-muted">None recorded.</li> : null}
        </ul>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Likely repair (hypothesis)</h3>
        <p className="mt-2">
          {diagnosis.likelyRepairCategory}
          <span className="ml-2 text-xs text-muted">advisory only — physical inspection may change this</span>
        </p>
        {diagnosis.suspectedCauses.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {diagnosis.suspectedCauses.map((c, i) => (
              <li key={i}>
                {c.cause} <span className="text-xs text-muted">— basis: {c.basis}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-card border border-warning/30 bg-warning/5 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-warning">Unknown until physical inspection</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {diagnosis.unknowns.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
          {diagnosis.unknowns.length === 0 ? <li className="text-muted">None recorded.</li> : null}
        </ul>
      </section>

      {diagnosis.recommendedQuestions.length > 0 ? (
        <section className="rounded-card border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Suggested checks / questions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {diagnosis.recommendedQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted">{diagnosis.limitations.join(" ")}</p>

      <button
        type="button"
        onClick={runDiagnosis}
        className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas"
      >
        Re-run assessment
      </button>
    </div>
  );
}
