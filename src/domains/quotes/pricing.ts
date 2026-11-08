/**
 * Deterministic demo quote pricing (S03 scope). Quote values are illustrative
 * demo data — not live market quotes. Same inputs always produce the same
 * amounts, so regeneration is idempotent and totals are reproducible.
 */

import type { RepairCategory } from "@prisma/client";
import { sumMinor } from "@/lib/money";

export type QuoteProfile = {
  partMultiplier: number;
  labourMultiplier: number;
  warrantyDays: number;
  estimatedDurationHours: number;
};

/** Three stable demo profiles: budget, standard, premium care. */
export const QUOTE_PROFILES: QuoteProfile[] = [
  { partMultiplier: 0.85, labourMultiplier: 1.0, warrantyDays: 90, estimatedDurationHours: 3 },
  { partMultiplier: 1.0, labourMultiplier: 1.0, warrantyDays: 180, estimatedDurationHours: 4 },
  { partMultiplier: 1.15, labourMultiplier: 1.0, warrantyDays: 365, estimatedDurationHours: 6 },
];

type CategoryBase = { partMinor: number; labourMinor: number; componentLabel: string; scope: string; exclusions: string };

const CATEGORY_BASE: Record<Exclude<RepairCategory, "OTHER"> | "OTHER", CategoryBase> = {
  DISPLAY_REPLACEMENT: {
    partMinor: 6999,
    labourMinor: 3499,
    componentLabel: "Display assembly (technician-declared)",
    scope: "Replace the cracked/faulty display assembly, verify touch and brightness, water-resistance not restored.",
    exclusions: "Liquid damage, frame deformation, Face ID/True Tone restoration, data recovery.",
  },
  BATTERY_REPLACEMENT: {
    partMinor: 4999,
    labourMinor: 1999,
    componentLabel: "Battery (technician-declared)",
    scope: "Replace the battery, verify charge cycle and health reporting.",
    exclusions: "Water damage, charging-port faults, battery-case swelling caused by frame damage.",
  },
  CHARGING_PORT_REPLACEMENT: {
    partMinor: 2999,
    labourMinor: 2499,
    componentLabel: "Charging port flex (technician-declared)",
    scope: "Replace the charging port flex, verify charging and data transfer.",
    exclusions: "Battery faults, board-level corrosion, accessories.",
  },
  CAMERA_REPLACEMENT: {
    partMinor: 5999,
    labourMinor: 2999,
    componentLabel: "Camera module (technician-declared)",
    scope: "Replace the affected camera module, verify focus and flash.",
    exclusions: "Front sensor faults, lens glass only repairs, water damage.",
  },
  DIAGNOSTIC_ONLY: {
    partMinor: 0,
    labourMinor: 2999,
    componentLabel: "No parts required — diagnostic service",
    scope: "Physical inspection with written findings; no parts installed.",
    exclusions: "Parts and repair labour beyond diagnostics.",
  },
  OTHER: {
    partMinor: 4999,
    labourMinor: 2999,
    componentLabel: "Component as declared by technician (simulated)",
    scope: "Replace the declared component for the selected device; scope confirmed in the contract.",
    exclusions: "Water damage, unrelated faults, data recovery.",
  },
};

export type ComputedQuote = {
  componentLabel: string;
  partChargeMinor: number;
  labourMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
  warrantyDays: number;
  warrantyText: string;
  estimatedDurationHours: number;
  scopeText: string;
  exclusionsText: string;
};

export function computeQuote(category: RepairCategory, profile: QuoteProfile): ComputedQuote {
  const base = CATEGORY_BASE[category];
  const partChargeMinor = Math.round(base.partMinor * profile.partMultiplier);
  const labourMinor = Math.round(base.labourMinor * profile.labourMultiplier);
  const totalMinor = sumMinor([partChargeMinor, labourMinor, 0, 0]);
  return {
    componentLabel: base.componentLabel,
    partChargeMinor,
    labourMinor,
    feesMinor: 0,
    taxMinor: 0,
    totalMinor,
    warrantyDays: profile.warrantyDays,
    warrantyText: `${profile.warrantyDays}-day workmanship warranty (simulated demo terms)`,
    estimatedDurationHours: profile.estimatedDurationHours,
    scopeText: base.scope,
    exclusionsText: base.exclusions,
  };
}
