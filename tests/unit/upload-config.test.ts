import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/storage";

describe("upload validation config", () => {
  const base = { byteSize: 1000, mimeType: "image/png" };

  it("accepts allowed raster types within limits", () => {
    expect(validateUpload(base).ok).toBe(true);
    expect(validateUpload({ byteSize: 1000, mimeType: "image/jpeg" }).ok).toBe(true);
    expect(validateUpload({ byteSize: 1000, mimeType: "image/webp" }).ok).toBe(true);
  });

  it("rejects disallowed and spoofed types", () => {
    expect(validateUpload({ byteSize: 1000, mimeType: "image/svg+xml" }).ok).toBe(false);
    expect(validateUpload({ byteSize: 1000, mimeType: "text/html" }).ok).toBe(false);
    expect(validateUpload({ byteSize: 1000, mimeType: "application/javascript" }).ok).toBe(false);
    expect(validateUpload({ byteSize: 1000, mimeType: "application/json", declaredMime: "image/png" }).ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(validateUpload({ byteSize: 0, mimeType: "image/png" }).ok).toBe(false);
    expect(validateUpload({ byteSize: 9_000_000, mimeType: "image/png" }).ok).toBe(false);
    // explicit override respected
    expect(validateUpload({ byteSize: 9_000_000, mimeType: "image/png" }, { maxBytes: 10_000_000 }).ok).toBe(true);
  });

  it("enforces max image count", () => {
    expect(validateUpload(base, { maxCount: 4, currentCount: 4 }).ok).toBe(false);
    expect(validateUpload(base, { maxCount: 4, currentCount: 3 }).ok).toBe(true);
  });
});
