/**
 * MVP-controlled device catalog (S01-owned). The user selects the exact model;
 * AI never infers device identity from the photograph. "Other" allows a clearly
 * unverified model string — exact part search is then blocked downstream.
 */

export type DeviceCatalogEntry = {
  brand: string;
  model: string;
  /** Model identifier used for exact-match part search; null means unknown. */
  modelIdentifier: string | null;
};

export const DEVICE_CATALOG: DeviceCatalogEntry[] = [
  { brand: "Apple", model: "iPhone 13", modelIdentifier: "iphone-13" },
  { brand: "Apple", model: "iPhone 13 Pro", modelIdentifier: "iphone-13-pro" },
  { brand: "Apple", model: "iPhone 13 mini", modelIdentifier: "iphone-13-mini" },
  { brand: "Apple", model: "iPhone 14", modelIdentifier: "iphone-14" },
  { brand: "Apple", model: "iPhone 14 Pro", modelIdentifier: "iphone-14-pro" },
  { brand: "Samsung", model: "Galaxy S22", modelIdentifier: "galaxy-s22" },
  { brand: "Samsung", model: "Galaxy S23", modelIdentifier: "galaxy-s23" },
  { brand: "Google", model: "Pixel 7", modelIdentifier: "pixel-7" },
  { brand: "Google", model: "Pixel 7 Pro", modelIdentifier: "pixel-7-pro" },
];

export const OTHER_DEVICE = "__other__";

export function isKnownDevice(brand: string, model: string): DeviceCatalogEntry | undefined {
  return DEVICE_CATALOG.find((e) => e.brand === brand && e.model === model);
}
