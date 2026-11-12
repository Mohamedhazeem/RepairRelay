"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState, SkeletonState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";

type Config = { clientId: string; currency: string; environment: string };

type PayPalButtonsConfig = {
  style?: Record<string, string>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => void;
  onError: (err: unknown) => void;
};

type PayPalNamespace = {
  Buttons: (config: PayPalButtonsConfig) => { render: (selector: HTMLElement | string) => Promise<void> };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

export function PaymentPanel({
  contractId,
  contractVersion,
  totalMinor,
  repairerName,
  initialStatus,
  initialOrderId,
}: {
  contractId: string;
  contractVersion: number;
  totalMinor: number;
  repairerName: string;
  initialStatus: string | null;
  initialOrderId: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const [phase, setPhase] = useState<"idle" | "creating" | "approving" | "authorizing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugId, setDebugId] = useState<string | null>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const renderedFor = useRef<string>("");

  useEffect(() => {
    fetch("/api/paypal/config")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error((r.status === 503 ? "Payments are not configured" : "Could not load payment config")))))
      .then((c: Config) => setConfig(c))
      .catch((e: Error) => setConfigError(e.message));
  }, []);

  // Load the official SDK once the config is known.
  useEffect(() => {
    if (!config || document.getElementById("paypal-sdk")) return;
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.sandbox.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&intent=authorize&currency=${encodeURIComponent(config.currency)}`;
    script.async = true;
    document.body.appendChild(script);
  }, [config]);

  // Render Buttons once the SDK is available and there is no completed authorization.
  useEffect(() => {
    if (!config || status === "AUTHORIZED" || phase === "creating" || phase === "authorizing") return;
    const sdkReady = () => {
      if (!window.paypal || !buttonsRef.current || renderedFor.current === `${orderId}:${status}`) return;
      renderedFor.current = `${orderId}:${status}`;
      buttonsRef.current.innerHTML = "";
      window.paypal
        .Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
          createOrder: async () => {
            setPhase("creating");
            setError(null);
            setDebugId(null);
            try {
              const res = await fetch(`/api/contracts/${contractId}/paypal-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expectedContractVersion: contractVersion }),
              });
              const body = (await res.json().catch(() => null)) as { paypalOrderId?: string; message?: string; debugId?: string } | null;
              if (!res.ok || !body?.paypalOrderId) {
                setError(body?.message ?? "Could not create the payment order");
                setDebugId(body?.debugId ?? null);
                setPhase("idle");
                throw new Error("create-order-failed");
              }
              setOrderId(body.paypalOrderId);
              setPhase("approving");
              return body.paypalOrderId;
            } catch (e) {
              if ((e as Error).message !== "create-order-failed") setPhase("idle");
              throw e;
            }
          },
          onApprove: async (data) => {
            setPhase("authorizing");
            try {
              const res = await fetch(`/api/paypal/orders/${data.orderID}/authorize`, { method: "POST" });
              const body = (await res.json().catch(() => null)) as { status?: string; message?: string; debugId?: string } | null;
              if (!res.ok || body?.status !== "AUTHORIZED") {
                // Never set AUTHORIZED from the SDK callback alone.
                setError(body?.message ?? "The authorization could not be confirmed — your approval is recorded and the status is being verified");
                setDebugId(body?.debugId ?? null);
                setStatus(body?.status ?? "AUTHORIZATION_UNKNOWN");
                setPhase("idle");
                return;
              }
              setStatus("AUTHORIZED");
              setPhase("idle");
              router.refresh();
            } catch {
              setError("Network error after approval — the payment status is being reconciled; do not retry the payment");
              setStatus("AUTHORIZATION_UNKNOWN");
              setPhase("idle");
            }
          },
          onCancel: async () => {
            setPhase("idle");
            setStatus("BUYER_CANCELLED");
            if (orderId) {
              await fetch(`/api/paypal/orders/${orderId}/cancel`, { method: "POST" }).catch(() => undefined);
            }
          },
          onError: (err) => {
            setPhase("idle");
            setError("PayPal could not be reached — please retry in a moment");
            void err;
          },
        })
        .render(buttonsRef.current);
    };
    if (window.paypal) {
      sdkReady();
      return;
    }
    const script = document.getElementById("paypal-sdk");
    if (script) {
      script.addEventListener("load", sdkReady);
      script.addEventListener("error", () => setConfigError("PayPal could not be loaded — check your connection and retry"));
      return () => {
        script.removeEventListener("load", sdkReady);
      };
    }
  }, [config, status, phase, contractId, contractVersion, orderId, router]);

  if (configError) {
    return <ErrorState title="Payments unavailable" description={configError} />;
  }
  if (!config) {
    return <SkeletonState lines={3} />;
  }

  const authorized = status === "AUTHORIZED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label="PAYPAL SANDBOX" tone="warning" className="shrink-0" />
        {status ? <StatusBadge label={status.replaceAll("_", " ")} tone={authorized ? "success" : status === "BUYER_CANCELLED" || status.includes("DECLINED") ? "danger" : "warning"} className="shrink-0" /> : null}
      </div>

      <section className="rounded-card border border-line bg-surface p-5 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between"><dt className="text-muted">Contract total</dt><dd className="text-base font-bold">{formatUsd(totalMinor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Repairer</dt><dd>{repairerName} (simulated)</dd></div>
        </dl>
        <p className="mt-3 text-muted">
          PayPal will <span className="font-semibold">authorize</span> this amount now — funds are held, not charged. Capture is
          requested only after you accept the completed repair evidence. <span className="font-semibold">This is not escrow</span> and
          does not pay the simulated repairer.
        </p>
      </section>

      {error ? <ErrorState title="Payment action failed" description={error} retry={undefined} /> : null}
      {debugId ? <p className="text-xs text-muted">Provider debug reference: {debugId} (no secrets included)</p> : null}

      {phase === "authorizing" ? (
        <div aria-live="polite">
          <SkeletonState lines={2} />
          <p className="mt-2 text-sm text-muted">Confirming the authorization with the payment provider…</p>
        </div>
      ) : authorized ? (
        <div className="rounded-card border border-success/30 bg-success/5 p-5" aria-live="polite">
          <p className="text-sm font-semibold text-success">Payment authorized — funds are held for this repair.</p>
          <p className="mt-1 text-sm text-muted">
            The simulated repairer can now begin work. Nothing is captured until you accept the completed repair.
          </p>
        </div>
      ) : status === "BUYER_CANCELLED" ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-5" aria-live="polite">
          <p className="text-sm font-semibold text-danger">Approval cancelled — no authorization exists.</p>
          <p className="mt-1 text-sm text-muted">You can retry the payment below; no money moved.</p>
        </div>
      ) : (
        <div>
          <div ref={buttonsRef} className="min-h-[120px]" />
          {phase === "creating" ? <p className="mt-2 text-sm text-muted">Creating the payment order…</p> : null}
          {phase === "approving" ? <p className="mt-2 text-sm text-muted">Complete the approval in the PayPal window.</p> : null}
        </div>
      )}
    </div>
  );
}
