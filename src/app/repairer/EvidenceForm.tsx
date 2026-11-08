"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorState } from "@/components/ui/states";
import { MANDATORY_CHECKS } from "@/domains/evidence/checks";

const CHECK_LABELS: Record<string, string> = {
  display_image: "Display shows image",
  touch_response: "Touch responds",
  brightness_control: "Brightness control works",
  charge_cycle: "Charges normally",
  battery_health: "Battery health reports",
  charging: "Charging works",
  data_transfer: "Data transfer works",
  camera_image: "Camera captures image",
  flash: "Flash works",
  inspection_report: "Inspection report written",
  device_powers_on: "Device powers on",
};

type JobView = {
  jobId: string;
  status: string;
  contractVersionId: string;
};

export function EvidenceForm({
  repairId,
  job,
  category,
  intakeAssets,
  canStart,
  canSubmit,
}: {
  repairId: string;
  job: JobView | null;
  category: string;
  intakeAssets: Array<{ id: string; width: number; height: number }>;
  canStart: boolean;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const afterInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "uploading" | "submitting">(job ? "idle" : canStart ? "idle" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [afterIds, setAfterIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [declaration, setDeclaration] = useState("");
  const [basis, setBasis] = useState<"TECHNICIAN_DECLARATION" | "LABEL_PHOTO" | "OTHER">("TECHNICIAN_DECLARATION");
  const [checks, setChecks] = useState<Record<string, "PASS" | "FAIL">>({});
  const [notes, setNotes] = useState("");

  const requiredChecks = MANDATORY_CHECKS[category] ?? MANDATORY_CHECKS.OTHER;

  async function upload(file: File, kind: "AFTER" | "COMPONENT_LABEL") {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const res = await fetch(`/api/repairs/${repairId}/evidence/assets`, { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { assetId?: string; message?: string } | null;
    if (!res.ok || !body?.assetId) {
      setError(body?.message ?? "Upload failed");
      return null;
    }
    return body.assetId;
  }

  async function onFiles(files: FileList | null, kind: "AFTER" | "COMPONENT_LABEL") {
    if (!files?.length) return;
    setPhase("uploading");
    setError(null);
    const setter = kind === "AFTER" ? setAfterIds : setLabelIds;
    for (const f of Array.from(files)) {
      const id = await upload(f, kind);
      if (id) setter((ids) => [...ids, id]);
    }
    setPhase("idle");
  }

  async function start() {
    setPhase("starting");
    setError(null);
    const res = await fetch(`/api/repairs/${repairId}/job/start`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { jobId?: string; message?: string } | null;
    setPhase("idle");
    if (!res.ok || !body?.jobId) {
      setError(body?.message ?? "Could not start the job");
      return;
    }
    setNotice("Repair started — submit your completion evidence below");
    router.refresh();
  }

  async function submit() {
    if (!job) return;
    setPhase("submitting");
    setError(null);
    const res = await fetch(`/api/repairs/${repairId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractVersionId: job.contractVersionId,
        componentDeclaration: declaration,
        componentIdentityBasis: basis,
        functionalChecks: requiredChecks.map((check) => ({ check, result: checks[check] ?? "FAIL" })),
        afterAssetIds: afterIds,
        componentAssetIds: labelIds,
        notes: notes || undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as { completeness?: string; advisoryFlags?: Array<{ code: string; severity: string; message: string }>; message?: string } | null;
    setPhase("idle");
    if (!res.ok) {
      setError(body?.message ?? "Submission failed");
      return;
    }
    setNotice(
      body?.completeness === "UNAVAILABLE"
        ? "Evidence submitted. AI completeness check is unavailable — the customer can still review your work."
        : `Evidence submitted (AI completeness: ${body?.completeness?.toLowerCase()}). Awaiting the customer decision.`,
    );
    router.refresh();
  }

  if (phase === "starting" || phase === "uploading" || phase === "submitting") {
    return <p className="text-sm text-muted">{phase === "starting" ? "Starting the job…" : phase === "uploading" ? "Uploading…" : "Submitting evidence…"}</p>;
  }

  if (!job) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
        {canStart ? (
          <>
            <p className="text-sm text-muted">Payment is authorized and the contract is approved — you can begin the repair.</p>
            <button type="button" onClick={start} className="mt-4 rounded-control bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
              Start repair
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Waiting for contract approval and confirmed payment authorization before work can start.</p>
        )}
        {error ? <div className="mt-3"><ErrorState title="Action failed" description={error} /></div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <ErrorState title="Action failed" description={error} /> : null}
      {notice ? (
        <p role="status" className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          {notice}
        </p>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Before photos (from customer intake)</h3>
        <ul className="mt-2 flex gap-3">
          {intakeAssets.map((a) => (
            <li key={a.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${a.id}`} alt={`Before photo (${a.width}×${a.height})`} className="h-20 w-20 rounded border border-line object-cover" />
            </li>
          ))}
          {intakeAssets.length === 0 ? <li className="text-sm text-muted">None.</li> : null}
        </ul>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Completion evidence</h3>

        <div>
          <p className="mb-1 text-sm font-medium">After-repair photos (required)</p>
          <button type="button" onClick={() => afterInput.current?.click()} className="rounded-control border border-line px-3 py-1.5 text-sm hover:bg-canvas">
            Add after photo
          </button>
          <input ref={afterInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFiles(e.target.files, "AFTER")} />
          {afterIds.length > 0 ? <p className="mt-1 text-xs text-success">{afterIds.length} photo(s) uploaded ✓</p> : null}
        </div>

        <div>
          <label htmlFor="declaration" className="mb-1 block text-sm font-medium">Component declaration (required)</label>
          <textarea
            id="declaration"
            value={declaration}
            onChange={(e) => setDeclaration(e.target.value)}
            rows={2}
            placeholder="e.g. OLED display assembly, technician-declared, installed and verified"
            className="w-full rounded-control border border-line px-3 py-2"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="basis" className="mb-1 block text-sm font-medium">Component identity basis</label>
            <select id="basis" value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} className="w-full rounded-control border border-line px-3 py-2">
              <option value="TECHNICIAN_DECLARATION">Technician declaration only</option>
              <option value="LABEL_PHOTO">Label/packaging photo provided</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Label/packaging photo (optional)</p>
            <button type="button" onClick={() => labelInput.current?.click()} className="rounded-control border border-line px-3 py-1.5 text-sm hover:bg-canvas">
              Add label photo
            </button>
            <input ref={labelInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFiles(e.target.files, "COMPONENT_LABEL")} />
            {labelIds.length > 0 ? <p className="mt-1 text-xs text-success">Label photo uploaded ✓</p> : null}
            {basis === "TECHNICIAN_DECLARATION" ? <p className="mt-1 text-xs text-muted">Component identity will be marked technician-declared, not photo-verified.</p> : null}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Functional checks (all required)</legend>
          <div className="space-y-2">
            {requiredChecks.map((check) => (
              <div key={check} className="flex items-center justify-between rounded-control border border-line px-3 py-2 text-sm">
                <span>{CHECK_LABELS[check] ?? check}</span>
                <div className="flex gap-2">
                  {(["PASS", "FAIL"] as const).map((r) => (
                    <label key={r} className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name={`check-${check}`}
                        checked={checks[check] === r}
                        onChange={() => setChecks({ ...checks, [check]: r })}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Repair completion note (optional)</span>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-control border border-line px-3 py-2" />
        </label>

        <button
          type="button"
          disabled={!canSubmit || afterIds.length === 0 || declaration.trim().length < 5 || requiredChecks.some((c) => !checks[c])}
          onClick={submit}
          className="rounded-control bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          Submit evidence for customer review
        </button>
      </section>
    </div>
  );
}
