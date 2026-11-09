import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import { levelForExp, type ReputationLevel } from "@/lib/reputation/levels";
import type { LeaderboardEntry, ReputationSourceType } from "@/lib/types";

export interface ReputationSummary {
  address: string;
  exp: number;
  level: ReputationLevel;
  event_count: number;
  last_event_at: string | null;
}

/** Community-specific EXP total for one wallet. */
export async function getCommunityExp(
  communityId: string,
  address: string,
): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("community_reputation")
    .select("exp")
    .eq("community_id", communityId)
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (error) throw error;
  return data?.exp ?? 0;
}

export async function getReputationSummary(
  communityId: string,
  address: string,
): Promise<ReputationSummary> {
  const supabase = createServiceRoleClient();
  const normalized = normalizeAddress(address);
  const { data, error } = await supabase
    .from("community_reputation")
    .select("exp, event_count, last_event_at")
    .eq("community_id", communityId)
    .eq("address", normalized)
    .maybeSingle();

  if (error) throw error;
  const exp = data?.exp ?? 0;
  return {
    address: normalized,
    exp,
    level: levelForExp(exp),
    event_count: data?.event_count ?? 0,
    last_event_at: data?.last_event_at ?? null,
  };
}

/**
 * Append an EXP event. EXP is never edited in place: every change is a new
 * ledger row, so totals are auditable and reproducible.
 */
export async function recordReputationEvent(entry: {
  communityId: string;
  address: string;
  delta: number;
  reason: string;
  sourceType?: ReputationSourceType;
  sourceId?: string | null;
  createdBy?: string | null;
}) {
  const supabase = createServiceRoleClient();
  const address = normalizeAddress(entry.address);

  const { data, error } = await supabase
    .from("reputation_events")
    .insert({
      community_id: entry.communityId,
      address,
      delta: entry.delta,
      reason: entry.reason,
      source_type: entry.sourceType ?? "manual",
      source_id: entry.sourceId ?? null,
      created_by: entry.createdBy ? normalizeAddress(entry.createdBy) : null,
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;

  await writeAuditLog({
    actor: entry.createdBy ?? null,
    action: "reputation.record",
    entityType: "reputation_event",
    entityId: data?.id ?? null,
    communityId: entry.communityId,
    metadata: { address, delta: entry.delta, reason: entry.reason },
  });

  return data;
}

/**
 * Leaderboard for a community. `period` of "week"/"month" restricts the window
 * of EXP events that count, which is how weekly and monthly boards are derived.
 */
export async function getLeaderboard(
  communityId: string,
  options: { period?: "all" | "week" | "month"; limit?: number } = {},
): Promise<LeaderboardEntry[]> {
  const { period = "all", limit = 25 } = options;
  const supabase = createServiceRoleClient();

  const since =
    period === "week"
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : period === "month"
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  let query = supabase
    .from("reputation_events")
    .select("address, delta, created_at")
    .eq("community_id", communityId);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw error;

  const totals = new Map<string, { exp: number; count: number; last: string }>();
  for (const row of data ?? []) {
    const current = totals.get(row.address) ?? { exp: 0, count: 0, last: row.created_at };
    current.exp += row.delta;
    current.count += 1;
    if (row.created_at > current.last) current.last = row.created_at;
    totals.set(row.address, current);
  }

  const ranked = [...totals.entries()]
    .map(([address, v]) => ({
      address,
      exp: v.exp,
      event_count: v.count,
      last_event_at: v.last,
      username: null as string | null,
      display_name: null as string | null,
      avatar_url: null as string | null,
    }))
    .filter((entry) => entry.exp !== 0)
    .sort((a, b) => b.exp - a.exp || a.address.localeCompare(b.address))
    .slice(0, limit);

  if (ranked.length === 0) return ranked;

  const addresses = ranked.map((entry) => entry.address);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("address, username, display_name, avatar_url")
    .in("address", addresses);

  const byAddress = new Map(
    (profiles ?? []).map((p) => [p.address, p]),
  );
  for (const entry of ranked) {
    const profile = byAddress.get(entry.address);
    if (profile) {
      entry.username = profile.username;
      entry.display_name = profile.display_name;
      entry.avatar_url = profile.avatar_url;
    }
  }

  return ranked;
}

/** EXP history for one wallet within a community. */
export async function getReputationHistory(
  communityId: string,
  address: string,
  limit = 50,
) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reputation_events")
    .select("*")
    .eq("community_id", communityId)
    .eq("address", normalizeAddress(address))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
