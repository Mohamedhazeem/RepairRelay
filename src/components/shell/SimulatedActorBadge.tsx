import { StatusBadge } from "@/components/ui/StatusBadge";

/** Mandatory label wherever a seeded repairer is presented. Never imply real technicians. */
export function SimulatedActorBadge() {
  return <StatusBadge label="SIMULATED REPAIRER" tone="info" icon="◆" className="uppercase" />;
}
