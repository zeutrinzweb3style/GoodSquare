import {
  checkRateLimit,
  rateLimitHeaders,
  type RateLimitResult,
  type RateLimitRule,
} from "@/lib/developer/rate-limit";

/**
 * In-process rate-limit store. Requests are bucketed by an opaque identifier
 * (an API key id, or an IP for anonymous callers) and the timestamps of recent
 * requests are kept in memory.
 *
 * This is per-instance: a multi-instance deployment counts each instance
 * separately, so the effective limit scales with the fleet. That is acceptable
 * for a first release and is called out in the docs; a shared store (Redis)
 * can replace this module without changing the call sites.
 */

const WINDOW_CAP = 500; // hard cap on remembered timestamps per identifier

const store = new Map<string, number[]>();

/** Records a hit and evaluates the rule for `identifier`. */
export function consume(
  identifier: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  const previous = store.get(identifier) ?? [];
  const result = checkRateLimit({ timestamps: previous, now, rule });

  const next = [...previous, now].slice(-WINDOW_CAP);
  store.set(identifier, next);
  return result;
}

export function headersFor(
  result: RateLimitResult,
  rule: RateLimitRule,
  now: number = Date.now(),
): Record<string, string> {
  return rateLimitHeaders(result, rule, now);
}

/** Best-effort client identifier for anonymous callers. */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0].trim()}`;
  return `ip:${request.headers.get("x-real-ip") ?? "unknown"}`;
}

/** Test seam: clears all buckets. */
export function resetRateLimits(): void {
  store.clear();
}
