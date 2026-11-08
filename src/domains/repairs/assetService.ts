/**
 * Repair intake domain service (S01 scope). Owns RepairRequest and UploadedAsset
 * persistence, the image pipeline and asset access control.
 */

import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import type { Metadata, OutputInfo } from "sharp";
import { writeAudit } from "@/lib/audit";
import { validateUpload, getStorage, type AllowedImageMime } from "@/lib/storage";
import { isKnownDevice } from "@/domains/repairs/deviceCatalog";
import type { RepairCategory } from "@prisma/client";

export const MAX_INTAKE_IMAGES = 4;

export type CreateRepairInput = {
  customerId: string;
  deviceBrand: string;
  deviceModel: string;
  isOtherDevice: boolean;
  symptoms: string;
  repairCategory: RepairCategory | null;
};

export type CreateRepairResult =
  | { ok: true; repairRequest: { id: string; publicReference: string; status: string; version: number } }
  | { ok: false; code: "VALIDATION_ERROR"; message: string };

export async function createRepairRequest(prisma: PrismaClient, input: CreateRepairInput): Promise<CreateRepairResult> {
  const symptoms = input.symptoms.trim();
  if (symptoms.length < 10 || symptoms.length > 2000) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Describe the symptoms in 10–2000 characters" };
  }
  const brand = input.deviceBrand.trim();
  const model = input.deviceModel.trim();
  let modelIdentifier: string | null = null;
  let confidence: "USER_SELECTED" | "UNKNOWN" = "USER_SELECTED";

  if (input.isOtherDevice || !(brand && model)) {
    // Clearly unverified free-text model is allowed, but blocks exact part search later.
    if (!model || !brand) return { ok: false, code: "VALIDATION_ERROR", message: "Select a device or enter a description" };
    confidence = "UNKNOWN";
    modelIdentifier = null;
  } else {
    const known = isKnownDevice(brand, model);
    if (!known) return { ok: false, code: "VALIDATION_ERROR", message: "Unknown device — use the Other option for unverified models" };
    modelIdentifier = known.modelIdentifier;
  }

  const publicReference = `RR-${randomBytes(6).toString("hex").toUpperCase()}`;
  const created = await prisma.repairRequest.create({
    data: {
      publicReference,
      customerId: input.customerId,
      deviceBrand: brand,
      deviceModel: model,
      modelIdentifier,
      deviceModelConfidence: confidence,
      symptoms,
      repairCategory: input.repairCategory,
      status: "DRAFT",
    },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: created.id,
    actorType: "CUSTOMER",
    actorId: input.customerId,
    eventType: "repair_request.created",
  });
  return { ok: true, repairRequest: { id: created.id, publicReference: created.publicReference, status: created.status, version: created.version } };
}

export async function getOwnedRepair(prisma: PrismaClient, repairId: string, customerId: string) {
  return prisma.repairRequest.findFirst({ where: { id: repairId, customerId } });
}

export type ProcessedImage = { buffer: Buffer; mimeType: AllowedImageMime; width: number; height: number; sha256: string };

/**
 * Actual-decode validation, safe re-encode and metadata stripping.
 * Content sniffing beats browser MIME: SVG/HTML/animated inputs fail here.
 */
export async function processUploadedImage(file: File): Promise<ProcessedImage | { error: string }> {
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.byteLength === 0) return { error: "File is empty" };

  let decoded: Metadata & { format: string };
  try {
    const image = sharp(raw, { animated: false });
    const meta = await image.metadata();
    if (!meta.format) return { error: "File is not a decodable image" };
    // Normalize detected format to an allowlisted raster type; anything else is rejected.
    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") {
      return { error: `Unsupported image format (${meta.format}). Allowed: JPEG, PNG, WebP.` };
    }
    if ((meta.pages ?? 1) > 1) return { error: "Animated images are not supported" };
    decoded = { ...(meta as Metadata), format: meta.format };
  } catch {
    return { error: "File is not a decodable image" };
  }

  const targetMime: AllowedImageMime = decoded.format === "jpeg" ? "image/jpeg" : decoded.format === "png" ? "image/png" : "image/webp";
  // Re-encode: strips EXIF/geolocation (sharp drops metadata unless withMetadata is requested).
  const pipeline = sharp(raw, { animated: false }).rotate();
  let out: { data: Buffer; info: OutputInfo };
  try {
    out =
      targetMime === "image/jpeg"
        ? await pipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
        : targetMime === "image/png"
          ? await pipeline.png().toBuffer({ resolveWithObject: true })
          : await pipeline.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  } catch {
    return { error: "Image could not be re-encoded" };
  }
  const outMeta = await sharp(out.data).metadata();
  return {
    buffer: out.data,
    mimeType: targetMime,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    sha256: createHash("sha256").update(out.data).digest("hex"),
  };
}

export type AddAssetResult =
  | { ok: true; assetId: string; width: number; height: number; mimeType: string; byteSize: number }
  | { ok: false; code: "VALIDATION_ERROR" | "ASSET_INVALID" | "FORBIDDEN" | "NOT_FOUND"; message: string };

export async function addIntakeAsset(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
  file: File,
): Promise<AddAssetResult> {
  const repair = await prisma.repairRequest.findUnique({ where: { id: repairId } });
  if (!repair) return { ok: false, code: "NOT_FOUND", message: "Repair request not found" };
  if (repair.customerId !== customerId) return { ok: false, code: "FORBIDDEN", message: "Not your repair request" };

  const declaredMime = file.type || "application/octet-stream";
  const currentCount = await prisma.uploadedAsset.count({
    where: { repairRequestId: repairId, assetKind: "INTAKE", deletedAt: null },
  });
  const sizeCheck = validateUpload(
    { byteSize: file.size, mimeType: declaredMime },
    { maxCount: MAX_INTAKE_IMAGES, currentCount },
  );
  if (!sizeCheck.ok) return { ok: false, code: "ASSET_INVALID", message: sizeCheck.reason };

  const processed = await processUploadedImage(file);
  if ("error" in processed) return { ok: false, code: "ASSET_INVALID", message: processed.error };

  // Byte-size check after re-encode as well (re-encode can shrink or slightly grow files).
  const postCheck = validateUpload({ byteSize: processed.buffer.byteLength, mimeType: processed.mimeType });
  if (!postCheck.ok) return { ok: false, code: "ASSET_INVALID", message: postCheck.reason };

  const stored = await getStorage().put(processed.buffer, processed.mimeType);
  const asset = await prisma.uploadedAsset.create({
    data: {
      repairRequestId: repairId,
      ownerId: customerId,
      assetKind: "INTAKE",
      storageKey: stored.storageKey,
      mimeType: processed.mimeType,
      byteSize: processed.buffer.byteLength,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
    },
  });
  await writeAudit(prisma, {
    aggregateType: "RepairRequest",
    aggregateId: repairId,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "repair_request.asset_uploaded",
    payload: { assetId: asset.id, assetKind: "INTAKE", byteSize: processed.buffer.byteLength },
  });
  if (repair.status === "DRAFT") {
    await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "INTAKE_SUBMITTED" } });
  }
  return { ok: true, assetId: asset.id, width: processed.width, height: processed.height, mimeType: processed.mimeType, byteSize: processed.buffer.byteLength };
}

/** Access control for private assets: owner customer, or (later slices) the assigned repairer. */
export function canAccessAsset(
  user: { userId: string; role: "CUSTOMER" | "SIMULATED_REPAIRER" | "DEMO_ADMIN" },
  asset: { ownerId: string },
): boolean {
  return user.role === "CUSTOMER" && user.userId === asset.ownerId;
}

export async function getIntakeAssets(prisma: PrismaClient, repairId: string) {
  return prisma.uploadedAsset.findMany({
    where: { repairRequestId: repairId, assetKind: "INTAKE", deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}
