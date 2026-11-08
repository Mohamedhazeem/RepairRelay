"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorState } from "@/components/ui/states";

type CatalogEntry = { brand: string; model: string };

const REPAIR_CATEGORIES = [
  { value: "DISPLAY_REPLACEMENT", label: "Display / screen replacement" },
  { value: "BATTERY_REPLACEMENT", label: "Battery replacement" },
  { value: "CHARGING_PORT_REPLACEMENT", label: "Charging port" },
  { value: "CAMERA_REPLACEMENT", label: "Camera" },
  { value: "DIAGNOSTIC_ONLY", label: "Not sure — diagnose only" },
  { value: "OTHER", label: "Other" },
] as const;

const FUNCTION_CHECKS = ["Touch works", "Display shows image", "Charging works", "Sound works", "Camera works"] as const;

const MAX_IMAGES = 4;

export function IntakeForm({ catalog }: { catalog: CatalogEntry[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [brand, setBrand] = useState(catalog[0]?.brand ?? "");
  const [model, setModel] = useState(catalog[0]?.model ?? "");
  const [isOther, setIsOther] = useState(false);
  const [otherModel, setOtherModel] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [category, setCategory] = useState<string>("DISPLAY_REPLACEMENT");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const brands = [...new Set(catalog.map((c) => c.brand))];
  const models = catalog.filter((c) => c.brand === brand).map((c) => c.model);

  function onFiles(selected: FileList | null) {
    if (!selected) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(selected)) {
      if (next.length >= MAX_IMAGES) {
        setError(`Maximum ${MAX_IMAGES} images per request`);
        break;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        setError(`"${f.name}" is not a JPEG/PNG/WebP file`);
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        setError(`"${f.name}" exceeds the 8 MB limit`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const createRes = await fetch("/api/repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceBrand: brand,
          deviceModel: isOther ? otherModel : model,
          isOtherDevice: isOther,
          symptoms,
          repairCategory: category === "DISPLAY_REPLACEMENT" ? category : category,
        }),
      });
      const created = (await createRes.json()) as { repairId?: string; message?: string; code?: string };
      if (!createRes.ok) {
        setError(created.message ?? "Could not create the repair request");
        return;
      }
      const repairId = created.repairId!;
      for (const f of files) {
        const form = new FormData();
        form.set("file", f);
        form.set("assetKind", "INTAKE");
        const upRes = await fetch(`/api/repairs/${repairId}/assets`, { method: "POST", body: form });
        if (!upRes.ok) {
          const upErr = (await upRes.json().catch(() => null)) as { message?: string } | null;
          setError(upErr?.message ?? `Upload failed for "${f.name}" — your draft is saved`);
          router.push(`/repairs/${repairId}`);
          return;
        }
      }
      router.push(`/repairs/${repairId}`);
    } catch {
      setError("Network error — please retry");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <ErrorState title="Please check your request" description={error} /> : null}

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Device</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="brand" className="mb-1 block text-sm font-medium">Brand</label>
            <select
              id="brand"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel(catalog.find((c) => c.brand === e.target.value)?.model ?? "");
              }}
              className="w-full rounded-control border border-line bg-surface px-3 py-2"
            >
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="model" className="mb-1 block text-sm font-medium">Model</label>
            {isOther ? (
              <input
                id="model"
                value={otherModel}
                onChange={(e) => setOtherModel(e.target.value)}
                placeholder="Enter model — treated as unverified"
                className="w-full rounded-control border border-line bg-surface px-3 py-2"
              />
            ) : (
              <select
                id="model"
                value={model}
                onChange={(e) => {
                  if (e.target.value === "__other__") {
                    setIsOther(true);
                    setModel("");
                  } else {
                    setModel(e.target.value);
                  }
                }}
                className="w-full rounded-control border border-line bg-surface px-3 py-2"
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="__other__">Other / not sure…</option>
              </select>
            )}
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="category" className="mb-1 block text-sm font-medium">Repair category</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 sm:max-w-sm"
          >
            {REPAIR_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Symptoms</h2>
        <label htmlFor="symptoms" className="sr-only">Symptoms</label>
        <textarea
          id="symptoms"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          rows={4}
          required
          minLength={10}
          maxLength={2000}
          placeholder="e.g. The front glass is cracked after a drop. Touch still responds across most of the screen."
          className="w-full rounded-control border border-line bg-surface px-3 py-2"
        />
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">What still works? (optional)</legend>
          <div className="flex flex-wrap gap-3">
            {FUNCTION_CHECKS.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-control border border-line px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={checks[c] ?? false}
                  onChange={(e) => setChecks({ ...checks, [c]: e.target.checked })}
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-1 text-lg font-semibold">Photos</h2>
        <p className="mb-4 text-sm text-muted">Up to {MAX_IMAGES} images, JPEG/PNG/WebP, max 8 MB each. One clear damage photo is required for AI assessment.</p>
        <div
          role="button"
          tabIndex={0}
          aria-label="Add photos"
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInput.current?.click(); }}
          className="cursor-pointer rounded-card border-2 border-dashed border-line p-8 text-center text-muted hover:border-brand hover:text-brand"
        >
          Click to add photos
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => onFiles(e.target.files)}
        />
        {files.length > 0 ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {files.map((f, i) => (
              <li key={i} className="relative overflow-hidden rounded-card border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt={`Selected photo ${i + 1}`} className="h-28 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded bg-surface/90 px-2 py-0.5 text-xs font-semibold"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending || symptoms.trim().length < 10 || files.length === 0}
          className="rounded-control bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating request…" : "Create repair request"}
        </button>
      </div>
    </div>
  );
}
