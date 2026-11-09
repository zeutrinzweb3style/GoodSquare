import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  isRetryableStatus,
  nextRetryDelaySeconds,
  type WebhookEvent,
  type WebhookPayload,
} from "@/lib/developer/webhooks";
import { signPayload } from "@/lib/developer/webhooks";
import type { WebhookEndpointRow, WebhookDeliveryRow } from "@/lib/developer/webhook-service";

/**
 * Retry pass for failed webhook deliveries. A delivery that failed with a
 * retryable status is re-posted until it succeeds or the attempt budget is
 * spent. Intended to be run from a scheduled job (cron) or a manual trigger;
 * it processes a bounded batch so one call stays short.
 */

export interface QueueRunResult {
  processed: number;
  delivered: number;
  failed: number;
  rescheduled: number;
}

async function postRetry(
  endpoint: WebhookEndpointRow,
  payload: WebhookPayload,
): Promise<{ status: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GoodSquare-Webhooks/1.0",
        "X-GoodSquare-Event": payload.event,
        "X-GoodSquare-Delivery": payload.id,
        "X-GoodSquare-Signature": signPayload(endpoint.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, error: null };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

/** Processes due pending deliveries. Safe to call repeatedly. */
export async function processWebhookQueue(limit = 25): Promise<QueueRunResult> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("webhook_deliveries")
    .select("*")
    .eq("status", "pending")
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const result: QueueRunResult = {
    processed: 0,
    delivered: 0,
    failed: 0,
    rescheduled: 0,
  };

  for (const delivery of (due ?? []) as WebhookDeliveryRow[]) {
    result.processed += 1;

    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", delivery.endpoint_id)
      .maybeSingle();
    if (!endpoint) {
      await supabase
        .from("webhook_deliveries")
        .update({ status: "failed", error: "Endpoint no longer exists" })
        .eq("id", delivery.id);
      result.failed += 1;
      continue;
    }

    const outcome = await postRetry(endpoint, delivery.payload);
    const attempts = delivery.attempts + 1;
    const delivered = outcome.status !== null && outcome.status < 300;
    const retryable = isRetryableStatus(outcome.status);
    const delay = retryable ? nextRetryDelaySeconds(attempts) : null;
    const status = delivered ? "delivered" : delay === null ? "failed" : "pending";

    await supabase
      .from("webhook_deliveries")
      .update({
        status,
        attempts,
        response_status: outcome.status,
        error: outcome.error,
        delivered_at: delivered ? new Date().toISOString() : null,
        next_attempt_at:
          status === "pending"
            ? new Date(Date.now() + (delay ?? 0) * 1000).toISOString()
            : null,
      })
      .eq("id", delivery.id);

    if (delivered) result.delivered += 1;
    else if (status === "failed") result.failed += 1;
    else result.rescheduled += 1;
  }

  return result;
}

export type { WebhookEvent };
