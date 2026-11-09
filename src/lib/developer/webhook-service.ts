import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import {
  buildPayload,
  generateWebhookSecret,
  isRetryableStatus,
  nextRetryDelaySeconds,
  normalizeEvents,
  signPayload,
  type WebhookEvent,
  type WebhookPayload,
} from "@/lib/developer/webhooks";

export interface WebhookEndpointRow {
  id: string;
  owner_address: string;
  community_id: string | null;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload: WebhookPayload;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  response_status: number | null;
  error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

/** Only HTTPS endpoints are accepted, and localhost/private hosts are refused. */
export function isAllowedWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  // Refuse bare IPv4 literals in private ranges to blunt SSRF.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 169
    ) {
      return false;
    }
  }
  return true;
}

export async function listWebhookEndpoints(
  owner: string,
): Promise<WebhookEndpointRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("owner_address", normalizeAddress(owner))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWebhookEndpoint(input: {
  owner: string;
  url: string;
  events: string[];
  communityId?: string | null;
}): Promise<WebhookEndpointRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      owner_address: normalizeAddress(input.owner),
      url: input.url,
      secret: generateWebhookSecret(),
      events: normalizeEvents(input.events),
      community_id: input.communityId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateWebhookEndpoint(
  owner: string,
  id: string,
  patch: { url?: string; events?: string[]; active?: boolean },
): Promise<WebhookEndpointRow | null> {
  const supabase = createServiceRoleClient();
  const update: Record<string, unknown> = {};
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.events !== undefined) update.events = normalizeEvents(patch.events);
  if (patch.active !== undefined) update.active = patch.active;

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update(update)
    .eq("id", id)
    .eq("owner_address", normalizeAddress(owner))
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteWebhookEndpoint(
  owner: string,
  id: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", id)
    .eq("owner_address", normalizeAddress(owner))
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function listWebhookDeliveries(
  owner: string,
  endpointId: string,
  limit = 50,
): Promise<WebhookDeliveryRow[]> {
  const supabase = createServiceRoleClient();
  // Confirm the endpoint belongs to the caller before showing its deliveries.
  const { data: endpoint, error: endpointError } = await supabase
    .from("webhook_endpoints")
    .select("id")
    .eq("id", endpointId)
    .eq("owner_address", normalizeAddress(owner))
    .maybeSingle();
  if (endpointError) throw endpointError;
  if (!endpoint) return [];

  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("*")
    .eq("endpoint_id", endpointId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Active endpoints that should receive an event for a community: those scoped
 * to the community, plus unscoped endpoints whose owner is a member (so a
 * developer never receives activity from a community they are not part of).
 */
async function communityEndpoints(
  event: WebhookEvent,
  communityId: string,
): Promise<WebhookEndpointRow[]> {
  const supabase = createServiceRoleClient();
  const { data: members, error: memberError } = await supabase
    .from("community_members")
    .select("address")
    .eq("community_id", communityId);
  if (memberError) throw memberError;
  const memberAddresses = new Set(
    (members ?? []).map((row) => row.address as string),
  );

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("active", true)
    .contains("events", [event]);
  if (error) throw error;

  return (data ?? []).filter((row) => {
    if (row.community_id === communityId) return true;
    if (row.community_id === null) return memberAddresses.has(row.owner_address);
    return false;
  });
}

/** Active endpoints owned by `address` that subscribe to `event`. */
async function addressEndpoints(
  event: WebhookEvent,
  address: string,
): Promise<WebhookEndpointRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("owner_address", normalizeAddress(address))
    .eq("active", true)
    .contains("events", [event]);
  if (error) throw error;
  return data ?? [];
}

/** Signs and posts one payload. Returns the response status, or null on error. */
async function postDelivery(
  endpoint: WebhookEndpointRow,
  payload: WebhookPayload,
): Promise<{ status: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(endpoint.secret, timestamp, body);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GoodSquare-Webhooks/1.0",
        "X-GoodSquare-Event": payload.event,
        "X-GoodSquare-Delivery": payload.id,
        "X-GoodSquare-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, error: null };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

/**
 * Dispatches an event to every matching endpoint. Delivery is best-effort and
 * never throws: a webhook failure must not fail the action that triggered it.
 * A failed delivery is queued for retry by `processWebhookQueue`.
 *
 * Two dispatch modes, which may combine:
 *  - community events (`communityId` set): endpoints scoped to the community,
 *    plus unscoped endpoints whose owner is a member of it;
 *  - wallet events (`address` set): that wallet's own endpoints (for example a
 *    payee hearing about a payment even if they are not a member).
 */
export async function emitWebhookEvent(input: {
  event: WebhookEvent;
  communityId?: string | null;
  address?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const collected = [
      ...(input.communityId
        ? await communityEndpoints(input.event, input.communityId)
        : []),
      ...(input.address ? await addressEndpoints(input.event, input.address) : []),
    ];
    const byId = new Map(collected.map((endpoint) => [endpoint.id, endpoint]));
    const endpoints = Array.from(byId.values());
    if (endpoints.length === 0) return;

    const supabase = createServiceRoleClient();
    for (const endpoint of endpoints) {
      const { data: delivery, error } = await supabase
        .from("webhook_deliveries")
        .insert({
          endpoint_id: endpoint.id,
          event: input.event,
          payload: buildPayload({
            id: crypto.randomUUID(),
            event: input.event,
            createdAt: new Date().toISOString(),
            communityId: input.communityId ?? null,
            data: input.data,
          }),
          status: "pending",
        })
        .select("*")
        .single();
      if (error || !delivery) continue;

      const outcome = await postDelivery(endpoint, delivery.payload);
      const retryable = isRetryableStatus(outcome.status);
      const attempts = 1;
      const delay = retryable ? nextRetryDelaySeconds(attempts) : null;
      const delivered = outcome.status !== null && outcome.status < 300;
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
    }
  } catch (error) {
    console.error("emitWebhookEvent error", error);
  }
}
