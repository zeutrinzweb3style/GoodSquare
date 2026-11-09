/**
 * Sliding-window rate limiting. Pure and I/O-free: the caller supplies the
 * current time and the list of recent request timestamps, and this module
 * decides whether one more request is allowed and what to advertise.
 *
 * A sliding window is used rather than a fixed bucket so a burst at a window
 * boundary cannot double the effective limit.
 */

export interface RateLimitRule {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window after this one. */
  remaining: number;
  /** Seconds until the oldest request leaves the window (0 when not limited). */
  retryAfterSeconds: number;
  /** Total requests counted in the window, including this one if allowed. */
  count: number;
}

/** Default per-key and per-IP limits. Generous for reads, tighter for writes. */
export const DEFAULT_RATE_LIMIT: RateLimitRule = { limit: 120, windowSeconds: 60 };
export const WRITE_RATE_LIMIT: RateLimitRule = { limit: 30, windowSeconds: 60 };

/**
 * Drops timestamps older than the window. Timestamps are epoch milliseconds;
 * `now` and the entries are compared in the same unit.
 */
export function pruneWindow(
  timestamps: number[],
  now: number,
  windowSeconds: number,
): number[] {
  const cutoff = now - windowSeconds * 1000;
  return timestamps.filter((time) => time > cutoff).sort((a, b) => a - b);
}

/**
 * Evaluates a rule against recent request timestamps. `timestamps` may include
 * requests outside the window; they are pruned first.
 */
export function checkRateLimit(input: {
  timestamps: number[];
  now: number;
  rule: RateLimitRule;
}): RateLimitResult {
  const { now, rule } = input;
  const recent = pruneWindow(input.timestamps, now, rule.windowSeconds);

  if (recent.length >= rule.limit) {
    const oldest = recent[0];
    const retryAfterMs = oldest + rule.windowSeconds * 1000 - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      count: recent.length,
    };
  }

  return {
    allowed: true,
    remaining: rule.limit - recent.length - 1,
    retryAfterSeconds: 0,
    count: recent.length + 1,
  };
}

/** Seconds until the window resets, for the `X-RateLimit-Reset` header. */
export function rateLimitResetSeconds(now: number, rule: RateLimitRule): number {
  const windowMs = rule.windowSeconds * 1000;
  const elapsed = now % windowMs;
  return Math.ceil((windowMs - elapsed) / 1000);
}

/** Standard rate-limit response headers. */
export function rateLimitHeaders(
  result: RateLimitResult,
  rule: RateLimitRule,
  now: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rule.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(rateLimitResetSeconds(now, rule)),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }
  return headers;
}
