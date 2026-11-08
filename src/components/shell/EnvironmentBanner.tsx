import { StatusBadge } from "@/components/ui/StatusBadge";

/** Persistent demo/sandbox disclosure — required on every payment-adjacent screen. */
export function EnvironmentBanner({ environment = "DEMO ENVIRONMENT" }: { environment?: string }) {
  return (
    <StatusBadge
      label={environment}
      tone="warning"
      icon="⌂"
      className="uppercase"
    />
  );
}
