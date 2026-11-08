/**
 * S3 integration tests: search run persistence, freshness rules and the
 * selection price-change conflict — adapter injected with deterministic doubles.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { searchForRepair, refreshCandidate, selectCandidate, deviceComparisonQuery } from "../../src/domains/products/service";

const prisma = new PrismaClient();
let customerId: string;
let repairId: string;

const candidate = {
  id: "prod-1",
  title: "iPhone 13 (refurb)",
  offers: [
    {
      url: "https://buy.example.com/item",
      domain: "buy.example.com",
      price: { price: 241.99, compare_at_price: null, currency: "USD" },
      availability: "InStock",
      condition: "refurbished",
    },
  ],
};

const searchAdapter = async () => ({ ok: true as const, data: { products: [candidate], next_page_token: null } });
const detailAdapter = async () => ({ ok: true as const, data: { product: candidate as unknown as Record<string, unknown> } });

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `s3-test-${Date.now()}@test.local`, displayName: "S3 Tester", role: "CUSTOMER", passwordHash: "scrypt:00:00" },
  });
  customerId = user.id;
  const repair = await prisma.repairRequest.create({
    data: {
      publicReference: `RR-${Date.now().toString(16).toUpperCase()}`,
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      deviceModelConfidence: "USER_SELECTED",
      symptoms: "Cracked glass, touch works.",
    },
  });
  repairId = repair.id;
});

afterAll(async () => {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId }, include: { searchRuns: { include: { candidates: true } } } });
  if (repair) {
    for (const run of repair.searchRuns) {
      for (const c of run.candidates) await prisma.offerObservation.deleteMany({ where: { productCandidateId: c.id } });
      await prisma.productCandidate.deleteMany({ where: { searchRunId: run.id } });
      await prisma.productSearchRun.delete({ where: { id: run.id } });
    }
    await prisma.auditEvent.deleteMany({ where: { aggregateId: repairId } });
    await prisma.repairRequest.delete({ where: { id: repairId } });
  }
  await prisma.user.delete({ where: { id: customerId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("device comparison query (Repair-versus-Replace mode)", () => {
  it("builds the replacement-device wording", () => {
    expect(deviceComparisonQuery("Apple", "iPhone 13")).toBe("Refurbished unlocked Apple iPhone 13");
  });
});

describe("searchForRepair", () => {
  it("persists run + candidates + fresh observations and flags eligibility", async () => {
    const outcome = await searchForRepair(prisma, repairId, customerId, { adapter: searchAdapter });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.results).toHaveLength(1);
    const row = outcome.results[0];
    expect(row.selectionEligible).toBe(true);
    expect(row.compatibility).toBe("NOT_VERIFIED_BY_CHANNEL3");
    expect(row.offer?.fresh).toBe(true);
    expect(row.offer?.priceMinor).toBe(24199);

    const runs = await prisma.productSearchRun.findMany({ where: { repairRequestId: repairId } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCEEDED");
    expect(runs[0].query).toContain("Refurbished unlocked");
  });

  it("records FAILED runs and a safe code on provider errors without fabricating results", async () => {
    const failingAdapter = async () => ({ ok: false as const, error: { kind: "PROVIDER_ERROR" as const, status: 500 } });
    const outcome = await searchForRepair(prisma, repairId, customerId, { adapter: failingAdapter });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("DEPENDENCY_UNAVAILABLE");
    const failed = await prisma.productSearchRun.findFirst({ where: { repairRequestId: repairId, status: "FAILED" } });
    expect(failed).not.toBeNull();
    expect(failed!.resultCount).toBe(0);
  });
});

describe("selection", () => {
  it("succeeds when the fresh offer matches what the customer saw", async () => {
    const search = await searchForRepair(prisma, repairId, customerId, { adapter: searchAdapter });
    if (!search.ok) throw new Error("search failed");
    const row = search.results[0];
    const outcome = await selectCandidate(
      prisma,
      repairId,
      customerId,
      {
        candidateId: row.candidateId,
        channel3ProductId: row.channel3ProductId,
        offerDomain: row.offer!.domain,
        expectedPriceMinor: row.offer!.priceMinor!,
        currency: "USD",
      },
      { adapter: detailAdapter },
    );
    expect(outcome.ok).toBe(true);
    const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
    expect(repair?.selectedChannel3ProductId).toBe("prod-1");
  });

  it("returns 409 OFFER_CHANGED with fresh values when the price moved", async () => {
    const search = await searchForRepair(prisma, repairId, customerId, { adapter: searchAdapter });
    if (!search.ok) throw new Error("search failed");
    const row = search.results[0];
    const changedAdapter = async () => ({
      ok: true as const,
      data: {
        product: {
          ...candidate,
          offers: [{ ...candidate.offers[0], price: { price: 199.99, compare_at_price: null, currency: "USD" } }],
        } as unknown as Record<string, unknown>,
      },
    });
    const outcome = await selectCandidate(
      prisma,
      repairId,
      customerId,
      {
        candidateId: row.candidateId,
        channel3ProductId: row.channel3ProductId,
        offerDomain: row.offer!.domain,
        expectedPriceMinor: row.offer!.priceMinor!,
        currency: "USD",
      },
      { adapter: changedAdapter },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("OFFER_CHANGED");
    expect(outcome.fresh?.offer?.priceMinor).toBe(19999);
    // no selection persisted on conflict
    const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
    expect(repair?.selectedCandidateId).not.toBe(row.candidateId);
  });

  it("refreshCandidate keeps observations short-lived with an expiry", async () => {
    const search = await searchForRepair(prisma, repairId, customerId, { adapter: searchAdapter });
    if (!search.ok) throw new Error("search failed");
    const refreshed = await refreshCandidate(prisma, repairId, search.results[0].candidateId, customerId, { adapter: detailAdapter });
    expect(refreshed.ok).toBe(true);
    const obs = await prisma.offerObservation.findMany({ orderBy: { observedAt: "desc" }, take: 1 });
    expect(obs[0].expiresAt.getTime()).toBeGreaterThan(obs[0].observedAt.getTime());
  });
});
