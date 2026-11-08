/**
 * Product discovery domain service (S02 scope).
 * Repair-versus-Replace mode (S0 gate decision V-004): Channel3 provides live
 * replacement-device comparisons — never a parts-referenced contract, and never
 * compatibility claims. Offer observations are short-lived; nothing stale is
 * served as current.
 */

import { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { searchProducts, productDetail, type Channel3Error } from "@/integrations/channel3/client";
import { normalizeSearchResponse, pickDisplayOffer, NORMALIZATION_VERSION, type NormalizedCandidate, type NormalizedOffer } from "@/integrations/channel3/normalize";

export const OFFER_OBSERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEVICE_SEARCH_MAX = 8;

export type DiscoveryErrorCode =
  | "DEPENDENCY_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "RATE_LIMITED";

export function errorCodeFor(err: Channel3Error): DiscoveryErrorCode {
  switch (err.kind) {
    case "TIMEOUT":
    case "NETWORK":
    case "MALFORMED":
    case "PROVIDER_ERROR":
    case "NOT_CONFIGURED":
      return "DEPENDENCY_UNAVAILABLE";
    case "AUTH":
    case "BAD_REQUEST":
      return "PROVIDER_REJECTED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
  }
}

/** Replacement-device comparison query for the selected device (pivoted mode). */
export function deviceComparisonQuery(deviceBrand: string, deviceModel: string): string {
  return `Refurbished unlocked ${deviceBrand} ${deviceModel}`.trim();
}

export type SearchOutcome =
  | { ok: true; searchRunId: string; status: "SUCCEEDED" | "EMPTY"; results: DiscoveryResultRow[]; nextPageAvailable: boolean }
  | { ok: false; code: DiscoveryErrorCode; message: string };

export type DiscoveryResultRow = {
  candidateId: string;
  channel3ProductId: string;
  title: string;
  imageUrl: string | null;
  brandNames: string[];
  offer: {
    domain: string;
    url: string;
    priceMinor: number | null;
    currency: string | null;
    availability: string;
    condition: string;
    observedAt: string;
    fresh: boolean;
  } | null;
  selectionEligible: boolean;
  compatibility: "NOT_VERIFIED_BY_CHANNEL3";
};

function freshUntil(now: Date): Date {
  return new Date(now.getTime() + OFFER_OBSERVATION_TTL_MS);
}

export async function searchForRepair(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
  deps?: { adapter?: typeof searchProducts },
): Promise<SearchOutcome> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "PROVIDER_REJECTED", message: "Repair request not found" };
  }

  const query = deviceComparisonQuery(repair.deviceBrand, repair.deviceModel);
  const adapter = deps?.adapter ?? searchProducts;
  const result = await adapter(query, DEVICE_SEARCH_MAX);

  if (!result.ok) {
    await prisma.productSearchRun.create({
      data: {
        repairRequestId: repairId,
        query,
        country: getServerEnv().CHANNEL3_COUNTRY,
        currency: getServerEnv().CHANNEL3_CURRENCY,
        language: getServerEnv().CHANNEL3_LANGUAGE,
        mode: getServerEnv().CHANNEL3_SEARCH_MODE,
        status: "FAILED",
        resultCount: 0,
        normalizationVersion: NORMALIZATION_VERSION,
        errorCode: result.error.kind,
        completedAt: new Date(),
      },
    });
    return { ok: false, code: errorCodeFor(result.error), message: messageFor(result.error) };
  }

  const now = new Date();
  const normalized = normalizeSearchResponse(result.data, now.toISOString());
  const eligible = normalized.candidates.filter((c) => c.selectionEligible);

  const run = await prisma.productSearchRun.create({
    data: {
      repairRequestId: repairId,
      query,
      country: getServerEnv().CHANNEL3_COUNTRY,
      currency: getServerEnv().CHANNEL3_CURRENCY,
      language: getServerEnv().CHANNEL3_LANGUAGE,
      mode: getServerEnv().CHANNEL3_SEARCH_MODE,
      status: eligible.length > 0 ? "SUCCEEDED" : "EMPTY",
      resultCount: eligible.length,
      normalizationVersion: NORMALIZATION_VERSION,
      completedAt: new Date(),
    },
  });

  const rows: DiscoveryResultRow[] = [];
  for (const candidate of normalized.candidates) {
    const created = await prisma.productCandidate.create({
      data: {
        searchRunId: run.id,
        channel3ProductId: candidate.channel3ProductId,
        title: candidate.title,
        description: candidate.description,
        brandNames: candidate.brandNames,
        imageUrl: candidate.imageUrl,
      },
    });
    const display = pickDisplayOffer(candidate);
    if (display) {
      await prisma.offerObservation.create({
        data: {
          productCandidateId: created.id,
          domain: display.domain,
          offerUrl: display.url,
          priceMinor: display.priceMinor,
          currency: display.currency,
          availability: display.availability,
          condition: display.condition,
          observedAt: now,
          expiresAt: freshUntil(now),
        },
      });
    }
    rows.push(toRow(created.id, candidate, display, true));
  }

  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "product_search.performed",
    payload: { searchRunId: run.id, query, resultCount: eligible.length, dropped: normalized.droppedProducts },
  });

  return {
    ok: true,
    searchRunId: run.id,
    status: eligible.length > 0 ? "SUCCEEDED" : "EMPTY",
    results: rows,
    nextPageAvailable: Boolean(normalized.nextPageToken),
  };
}

function messageFor(err: Channel3Error): string {
  switch (err.kind) {
    case "TIMEOUT":
    case "NETWORK":
    case "PROVIDER_ERROR":
      return "Live product search is temporarily unavailable — please retry";
    case "MALFORMED":
      return "Product search returned an unexpected response — please retry";
    case "AUTH":
      return "Product search is not authorized — check the Channel3 key configuration";
    case "BAD_REQUEST":
      return "Product search rejected the query";
    case "RATE_LIMITED":
      return "Product search is rate limited — retry in a few seconds";
    case "NOT_CONFIGURED":
      return "Product search is not configured (missing API key)";
  }
}

function toRow(
  candidateId: string,
  candidate: NormalizedCandidate,
  display: Omit<NormalizedOffer, "selectionEligible"> | null,
  fresh: boolean,
): DiscoveryResultRow {
  return {
    candidateId,
    channel3ProductId: candidate.channel3ProductId,
    title: candidate.title,
    imageUrl: candidate.imageUrl,
    brandNames: candidate.brandNames,
    offer: display
      ? {
          domain: display.domain,
          url: display.url,
          priceMinor: display.priceMinor,
          currency: display.currency,
          availability: display.availability,
          condition: display.condition,
          observedAt: display.observedAt,
          fresh,
        }
      : null,
    selectionEligible: display
      ? display.priceMinor !== null && display.currency === "USD" && display.availability !== "OutOfStock"
      : false,
    compatibility: "NOT_VERIFIED_BY_CHANNEL3",
  };
}

export type RefreshOutcome =
  | { ok: true; row: DiscoveryResultRow }
  | { ok: false; code: "NOT_FOUND" | DiscoveryErrorCode; message: string };

/** Detail refresh: the only source of "current" offer values for display/selection. */
export async function refreshCandidate(
  prisma: PrismaClient,
  repairId: string,
  candidateId: string,
  customerId: string,
  deps?: { adapter?: typeof productDetail },
): Promise<RefreshOutcome> {
  const candidate = await prisma.productCandidate.findUnique({
    where: { id: candidateId },
    include: { searchRun: true },
  });
  if (!candidate || candidate.searchRun.repairRequestId !== repairId) {
    return { ok: false, code: "NOT_FOUND", message: "Candidate not found for this repair" };
  }
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair || repair.customerId !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  }

  const adapter = deps?.adapter ?? productDetail;
  const result = await adapter(candidate.channel3ProductId);
  if (!result.ok) {
    return { ok: false, code: errorCodeFor(result.error), message: messageFor(result.error) };
  }
  if (!result.data.product) {
    // Product no longer exists — candidate unavailable; never resurrect stale offers.
    return { ok: false, code: "PROVIDER_REJECTED", message: "This listing is no longer available — choose another" };
  }

  const now = new Date();
  const normalized = normalizeSearchResponse(
    { products: [result.data.product], next_page_token: null },
    now.toISOString(),
  );
  const normalizedCandidate = normalized.candidates[0];
  if (!normalizedCandidate) {
    return { ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "Refresh returned an unexpected product — please retry" };
  }
  const display = pickDisplayOffer(normalizedCandidate);
  if (display) {
    await prisma.offerObservation.create({
      data: {
        productCandidateId: candidate.id,
        domain: display.domain,
        offerUrl: display.url,
        priceMinor: display.priceMinor,
        currency: display.currency,
        availability: display.availability,
        condition: display.condition,
        observedAt: now,
        expiresAt: freshUntil(now),
      },
    });
  }
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "product_offer.refreshed",
    payload: { candidateId: candidate.id, fresh: Boolean(display) },
  });
  return { ok: true, row: toRow(candidate.id, normalizedCandidate, display, true) };
}

export type SelectionOutcome =
  | { ok: true; selected: { candidateId: string; channel3ProductId: string; priceMinor: number; domain: string; observedAt: string } }
  | { ok: false; code: "OFFER_CHANGED" | "NOT_FOUND" | DiscoveryErrorCode; message: string; fresh?: DiscoveryResultRow };

/** Selection: server re-fetches the offer and compares against what the customer saw. */
export async function selectCandidate(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
  input: { candidateId: string; channel3ProductId: string; offerDomain: string; expectedPriceMinor: number; currency: string },
  deps?: { adapter?: typeof productDetail },
): Promise<SelectionOutcome> {
  const refreshed = await refreshCandidate(prisma, repairId, input.candidateId, customerId, deps);
  if (!refreshed.ok) {
    return { ok: false, code: refreshed.code === "NOT_FOUND" ? "NOT_FOUND" : refreshed.code, message: refreshed.message };
  }
  const row = refreshed.row;
  if (
    row.channel3ProductId !== input.channel3ProductId ||
    !row.offer ||
    !row.selectionEligible ||
    row.offer.priceMinor !== input.expectedPriceMinor ||
    row.offer.currency !== input.currency ||
    row.offer.domain !== input.offerDomain
  ) {
    return {
      ok: false,
      code: "OFFER_CHANGED",
      message: "The current offer changed — review the fresh values and choose again",
      fresh: row,
    };
  }

  await prisma.repairRequest.update({
    where: { id: repairId },
    data: { selectedCandidateId: input.candidateId, selectedChannel3ProductId: row.channel3ProductId },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "product_selected",
    payload: { candidateId: input.candidateId, channel3ProductId: row.channel3ProductId, priceMinor: row.offer.priceMinor, domain: row.offer.domain },
  });
  return {
    ok: true,
    selected: {
      candidateId: input.candidateId,
      channel3ProductId: row.channel3ProductId,
      priceMinor: row.offer.priceMinor ?? 0,
      domain: row.offer.domain,
      observedAt: row.offer.observedAt,
    },
  };
}

/** Latest run rows for display; observations past TTL are surfaced as not-fresh (no offer shown). */
export async function latestSearchRows(prisma: PrismaClient, repairId: string): Promise<{ rows: DiscoveryResultRow[]; run: { id: string; status: string; query: string; createdAt: Date } | null }> {
  const run = await prisma.productSearchRun.findFirst({
    where: { repairRequestId: repairId },
    orderBy: { createdAt: "desc" },
    include: { candidates: { include: { offerObservations: { orderBy: { observedAt: "desc" }, take: 1 } } } },
  });
  if (!run) return { rows: [], run: null };
  const now = Date.now();
  const rows: DiscoveryResultRow[] = run.candidates.map((candidate) => {
    const obs = candidate.offerObservations[0];
    const fresh = Boolean(obs && obs.expiresAt.getTime() > now);
    const normalizedCandidate: NormalizedCandidate = {
      channel3ProductId: candidate.channel3ProductId,
      title: candidate.title,
      description: candidate.description ?? null,
      brandNames: (candidate.brandNames as string[] | null) ?? [],
      imageUrl: candidate.imageUrl,
      offers: [],
      selectionEligible: false,
    };
    const display =
      obs && fresh
        ? {
            domain: obs.domain,
            url: obs.offerUrl,
            priceMinor: obs.priceMinor,
            currency: obs.currency as NormalizedOffer["currency"],
            availability: obs.availability as NormalizedOffer["availability"],
            condition: obs.condition as NormalizedOffer["condition"],
            observedAt: obs.observedAt.toISOString(),
          }
        : null;
    const row = toRow(candidate.id, normalizedCandidate, display, fresh);
    return row;
  });
  return { rows, run: { id: run.id, status: run.status, query: run.query, createdAt: run.createdAt } };
}
