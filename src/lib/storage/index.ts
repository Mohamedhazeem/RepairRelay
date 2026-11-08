/**
 * Private storage abstraction (S00-owned). Local private driver for the local demo;
 * an object-storage adapter can replace it later behind the same interface.
 * Keys are generated server-side — never derived from user-supplied filenames.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { getServerEnv } from "@/lib/env";

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export type StoredObject = {
  storageKey: string;
  byteSize: number;
  mimeType: AllowedImageMime;
};

export interface StorageAdapter {
  put(buffer: Buffer, mimeType: AllowedImageMime): Promise<StoredObject>;
  get(storageKey: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMime }>;
  remove(storageKey: string): Promise<void>;
}

export type UploadValidationResult = { ok: true } | { ok: false; reason: string };

/** Shared upload validation rules (before any storage or AI call). */
export function validateUpload(
  input: { byteSize: number; mimeType: string; declaredMime?: string },
  opts?: { maxBytes?: number; maxCount?: number; currentCount?: number },
): UploadValidationResult {
  const env = getServerEnv();
  const maxBytes = opts?.maxBytes ?? env.MAX_UPLOAD_BYTES;
  if (!ALLOWED_IMAGE_MIME.includes(input.mimeType as AllowedImageMime)) {
    return { ok: false, reason: `Unsupported file type ${input.mimeType}. Allowed: JPEG, PNG, WebP.` };
  }
  if (input.byteSize <= 0) return { ok: false, reason: "File is empty" };
  if (input.byteSize > maxBytes) {
    return { ok: false, reason: `File exceeds the ${Math.floor(maxBytes / 1_048_576)} MB limit` };
  }
  if (opts?.currentCount !== undefined && opts?.maxCount !== undefined && opts.currentCount >= opts.maxCount) {
    return { ok: false, reason: `Maximum ${opts.maxCount} images per request` };
  }
  return { ok: true };
}

function safeExtension(mimeType: AllowedImageMime): string {
  return MIME_TO_EXT[mimeType] ?? extname("");
}

export class LocalPrivateStorage implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? getServerEnv().UPLOAD_LOCAL_DIR;
  }

  private resolveKey(storageKey: string): string {
    // Defense against traversal: keys are always generated UUIDs + known extension.
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(storageKey)) {
      throw new Error("Invalid storage key");
    }
    return join(this.baseDir, storageKey);
  }

  async put(buffer: Buffer, mimeType: AllowedImageMime): Promise<StoredObject> {
    const storageKey = `${randomUUID()}${safeExtension(mimeType)}`;
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.resolveKey(storageKey), buffer);
    return { storageKey, byteSize: buffer.byteLength, mimeType };
  }

  async get(storageKey: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMime }> {
    const ext = extname(storageKey).toLowerCase();
    const mimeType = (Object.keys(MIME_TO_EXT) as AllowedImageMime[]).find((m) => MIME_TO_EXT[m] === ext);
    if (!mimeType) throw new Error("Invalid storage key");
    const buffer = await readFile(this.resolveKey(storageKey));
    return { buffer, mimeType };
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(this.resolveKey(storageKey)).catch(() => undefined);
  }
}

let storage: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (!storage) storage = new LocalPrivateStorage();
  return storage;
}
