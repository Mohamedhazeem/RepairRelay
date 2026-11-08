/**
 * Minimal in-memory sliding-window rate limiter.
 * Documented limitation: single-instance only — acceptable for the local demo;
 * a shared store would be required before any multi-instance deployment.
 */

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(key: string): RateLimitResult {
    const current = this.now();
    const windowStart = current - this.windowMs;
    const prior = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (prior.length >= this.maxHits) {
      const retryAfterMs = prior[0] + this.windowMs - current;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    prior.push(current);
    this.hits.set(key, prior);
    return { allowed: true };
  }
}
