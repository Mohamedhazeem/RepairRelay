import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "@/lib/ratelimit";

describe("sliding-window rate limiter", () => {
  it("allows up to the limit and then blocks with retry hint", () => {
    const t = 1_000_000;
    const limiter = new SlidingWindowRateLimiter(3, 10_000, () => t);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    const blocked = limiter.check("u1");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("recovers after the window passes; keys are independent", () => {
    let t = 1_000_000;
    const limiter = new SlidingWindowRateLimiter(2, 10_000, () => t);
    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    t += 10_500;
    expect(limiter.check("a").allowed).toBe(true);
  });
});
