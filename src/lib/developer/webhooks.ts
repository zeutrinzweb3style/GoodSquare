import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Webhook event catalogue, payload shape, signing, and retry policy. The
 * signing and retry helpers are pure and I/O-free so they can be unit tested
 * directly.
 *
 * Every delivery is signed so a receiver can prove it came from Good Square.
 * The signature is `t=<unix seconds>,v1=<hex hmac>` over the string
 * `<t>.<raw body>`, using the endpoint's secret. Receivers should reject a
 * timestamp older than a few minutes to stop replays.
 */

export const WEBHOOK_EVENTS = [
  "community.created",
  "member.joined",
  "quest.submitted",
  "quest.approved",
  "proposal.created",
  "proposal.closed",
  "vote.cast",
  "payment.received",
  "treasury.spending.approved",
  "treasury.spending.executed",
  "reward.paid",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Only these events are dispatched. Unknown values are dropped at subscribe. */
export function normalizeEvents(events: string[]): WebhookEvent[] {
  return Array.from(new Set(events.filter(isWebhookEvent)));
}

export interface WebhookPayload {
  /** Delivery id, stable across retries so receivers can dedupe. */
  id: string;
  event: WebhookEvent;
  /** ISO timestamp of when the event happened. */
  createdAt: string;
  /** Community the event belongs to, when scoped to one. */
  communityId: string | null;
  /** Event-specific body. */
  data: Record<string, unknown>;
}

export function buildPayload(input: {
  id: string;
  event: WebhookEvent;
  createdAt: string;
  communityId?: string | null;
  data?: Record<string, unknown>;
}): WebhookPayload {
  return {
    id: input.id,
    event: input.event,
    createdAt: input.createdAt,
    communityId: input.communityId ?? null,
    data: input.data ?? {},
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * Signs a raw body. `timestamp` is unix seconds. Returns the header value
 * `t=<timestamp>,v1=<hex>`.
 */
export function signPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Parses a signature header into its parts, or null if malformed. */
export function parseSignatureHeader(
  header: string,
): { timestamp: number; signature: string } | null {
  const parts = header.split(",");
  const map: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) map[key.trim()] = value.trim();
  }
  const timestamp = Number(map.t);
  if (!Number.isFinite(timestamp) || !/^[0-9a-f]{64}$/.test(map.v1 ?? "")) {
    return null;
  }
  return { timestamp, signature: map.v1 };
}

/**
 * Verifies a signature header against a raw body. `toleranceSeconds` rejects
 * stale timestamps to stop replay; pass 0 to disable the check.
 */
export function verifySignature(input: {
  secret: string;
  header: string;
  rawBody: string;
  now: number;
  toleranceSeconds?: number;
}): boolean {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return false;

  const tolerance = input.toleranceSeconds ?? 300;
  if (tolerance > 0 && Math.abs(input.now - parsed.timestamp) > tolerance) {
    return false;
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${parsed.timestamp}.${input.rawBody}`)
    .digest();
  const provided = Buffer.from(parsed.signature, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Attempts and backoff schedule for a delivery. */
export const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600]; // 30s, 2m, 10m, 1h, 6h

/**
 * Seconds to wait before the next attempt, or null when the budget is spent.
 * `attempts` is the number of attempts already made.
 */
export function nextRetryDelaySeconds(attempts: number): number | null {
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  return BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
}

export function isDeliveryExhausted(attempts: number): boolean {
  return attempts >= MAX_DELIVERY_ATTEMPTS;
}

/** HTTP status codes that are worth retrying. */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true; // network error
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
