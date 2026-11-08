/**
 * S2 integration tests (local Postgres): repair creation, the image pipeline
 * (decode / re-encode / EXIF strip / format sniffing), asset access control.
 * Test images are synthesized with sharp — no user data involved.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { createRepairRequest, addIntakeAsset, processUploadedImage, canAccessAsset } from "../../src/domains/repairs/assetService";

const prisma = new PrismaClient();
let customerId: string;
let otherCustomerId: string;

beforeAll(async () => {
  const existing = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
  customerId = existing?.id ?? (await prisma.user.create({
    data: {
      email: `s2-test-customer-${Date.now()}@test.local`,
      displayName: "S2 Test Customer",
      role: "CUSTOMER",
      passwordHash: "scrypt:00:00",
    },
  })).id;
  otherCustomerId = await prisma.user.create({
    data: {
      email: `s2-test-other-${Date.now()}@test.local`,
      displayName: "S2 Other Customer",
      role: "CUSTOMER",
      passwordHash: "scrypt:00:00",
    },
  }).then((u) => u.id);
});

afterAll(async () => {
  // Clean up test rows and stored files.
  const repairs = await prisma.repairRequest.findMany({ where: { customer: { email: { contains: "s2-test-" } } } });
  for (const r of repairs) {
    for (const a of await prisma.uploadedAsset.findMany({ where: { repairRequestId: r.id } })) {
      await prisma.uploadedAsset.delete({ where: { id: a.id } }).catch(() => undefined);
    }
    await prisma.repairRequest.delete({ where: { id: r.id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { email: { contains: "s2-test-" } } });
  await prisma.$disconnect();
});

function syntheticJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 30, b: 40 } } }).jpeg().toBuffer();
}

function fileFrom(buffer: Buffer, name: string, type: string, sizeOverride?: number): File {
  const f = new File([new Uint8Array(buffer)], name, { type });
  if (sizeOverride !== undefined) Object.defineProperty(f, "size", { value: sizeOverride });
  return f;
}

describe("repair request creation", () => {
  it("creates a draft with a non-sequential public reference", async () => {
    const res = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      isOtherDevice: false,
      symptoms: "Cracked front glass after a drop; touch still responds.",
      repairCategory: "DISPLAY_REPLACEMENT",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repairRequest.publicReference).toMatch(/^RR-[0-9A-F]{12}$/);
      expect(res.repairRequest.status).toBe("DRAFT");
    }
  });

  it("rejects unknown catalog devices and short symptoms", async () => {
    const bad = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 99",
      isOtherDevice: false,
      symptoms: "Long enough symptoms text here for the rule.",
      repairCategory: null,
    });
    expect(bad.ok).toBe(false);

    const short = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      isOtherDevice: false,
      symptoms: "too short",
      repairCategory: null,
    });
    expect(short.ok).toBe(false);
  });

  it("allows clearly unverified other-device intake with UNKNOWN confidence", async () => {
    const res = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Acme",
      deviceModel: "Phone X2000",
      isOtherDevice: true,
      symptoms: "Screen flickers intermittently after charging.",
      repairCategory: "DIAGNOSTIC_ONLY",
    });
    expect(res.ok).toBe(true);
    const db = res.ok ? await prisma.repairRequest.findUnique({ where: { id: res.repairRequest.id } }) : null;
    expect(db?.deviceModelConfidence).toBe("UNKNOWN");
    expect(db?.modelIdentifier).toBeNull();
  });
});

describe("image pipeline", () => {
  it("re-encodes a JPEG and strips metadata", async () => {
    const withExif = await sharp(await syntheticJpeg())
      .withMetadata({ exif: { IFD0: { Copyright: "test-exif-marker" } } })
      .jpeg()
      .toBuffer();
    const out = await processUploadedImage(fileFrom(withExif, "photo.jpg", "image/jpeg"));
    expect("error" in out).toBe(false);
    if (!("error" in out)) {
      const meta = await sharp(out.buffer).metadata();
      expect(meta.exif).toBeUndefined(); // EXIF stripped
      expect(out.mimeType).toBe("image/jpeg");
      expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("rejects SVG content even with a spoofed image/png MIME", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    const out = await processUploadedImage(fileFrom(svg, "evil.png", "image/png"));
    expect("error" in out).toBe(true);
  });

  it("rejects corrupt files", async () => {
    const garbage = Buffer.from(Array.from({ length: 512 }, () => Math.floor(Math.random() * 255)));
    const out = await processUploadedImage(fileFrom(garbage, "corrupt.jpg", "image/jpeg"));
    expect("error" in out).toBe(true);
  });

  it("reports size/count problems through the service", async () => {
    const created = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      isOtherDevice: false,
      symptoms: "Testing upload validation limits end to end.",
      repairCategory: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const repairId = created.repairRequest.id;

    const oversized = await addIntakeAsset(prisma, repairId, customerId, fileFrom(await syntheticJpeg(), "big.jpg", "image/jpeg", 9_500_000));
    expect(oversized.ok).toBe(false);

    const good = await addIntakeAsset(prisma, repairId, customerId, fileFrom(await syntheticJpeg(), "ok.jpg", "image/jpeg"));
    expect(good.ok).toBe(true);

    const spoof = await addIntakeAsset(prisma, repairId, customerId, fileFrom(Buffer.from("<html></html>"), "x.png", "image/png"));
    expect(spoof.ok).toBe(false);
  });

  it("enforces ownership on uploads and asset reads", async () => {
    const created = await createRepairRequest(prisma, {
      customerId,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      isOtherDevice: false,
      symptoms: "Ownership check fixture for the access-control tests.",
      repairCategory: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const repairId = created.repairRequest.id;

    const notOwner = await addIntakeAsset(prisma, repairId, otherCustomerId, fileFrom(await syntheticJpeg(), "x.jpg", "image/jpeg"));
    expect(notOwner.ok).toBe(false);
    if (!notOwner.ok) expect(notOwner.code).toBe("FORBIDDEN");

    const asset = await addIntakeAsset(prisma, repairId, customerId, fileFrom(await syntheticJpeg(), "mine.jpg", "image/jpeg"));
    expect(asset.ok).toBe(true);
    if (!asset.ok) return;

    expect(canAccessAsset({ userId: customerId, role: "CUSTOMER" }, { ownerId: customerId })).toBe(true);
    expect(canAccessAsset({ userId: otherCustomerId, role: "CUSTOMER" }, { ownerId: customerId })).toBe(false);
    expect(canAccessAsset({ userId: otherCustomerId, role: "SIMULATED_REPAIRER" }, { ownerId: customerId })).toBe(false);
  });
});
