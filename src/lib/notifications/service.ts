import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import type { Notification } from "@/lib/types";

/**
 * In-app notifications. They are informational only and never gate an action;
 * trusted server code writes them, the recipient reads and marks them.
 */
export async function notify(input: {
  address: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  communityId?: string | null;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("notifications").insert({
    address: normalizeAddress(input.address),
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    community_id: input.communityId ?? null,
  });
  // A notification is a courtesy; never fail the action it describes.
  if (error) console.error("notify error", error);
}

export async function listNotifications(
  address: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  const { limit = 50, unreadOnly = false } = options;
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("address", normalizeAddress(address))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationsRead(
  address: string,
  ids?: string[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("address", normalizeAddress(address))
    .is("read_at", null);
  if (ids && ids.length > 0) query = query.in("id", ids);

  const { error } = await query;
  if (error) throw error;
}
