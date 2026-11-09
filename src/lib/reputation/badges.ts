import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";

export async function listBadges(communityId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("badges")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getBadge(communityId: string, badgeId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("badges")
    .select("*")
    .eq("community_id", communityId)
    .eq("id", badgeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBadge(entry: {
  communityId: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  createdBy: string;
}) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("badges")
    .insert({
      community_id: entry.communityId,
      slug: entry.slug,
      name: entry.name,
      description: entry.description || null,
      icon: entry.icon || null,
      created_by: normalizeAddress(entry.createdBy),
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;

  await writeAuditLog({
    actor: entry.createdBy,
    action: "badge.create",
    entityType: "badge",
    entityId: data?.id ?? null,
    communityId: entry.communityId,
    metadata: { slug: entry.slug },
  });

  return data;
}

/** Award a badge to a wallet. Idempotent per (badge, address). */
export async function awardBadge(entry: {
  badgeId: string;
  communityId: string;
  address: string;
  awardedBy: string;
}) {
  const supabase = createServiceRoleClient();
  const address = normalizeAddress(entry.address);

  const { data, error } = await supabase
    .from("user_badges")
    .insert({
      badge_id: entry.badgeId,
      community_id: entry.communityId,
      address,
      awarded_by: normalizeAddress(entry.awardedBy),
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;

  await writeAuditLog({
    actor: entry.awardedBy,
    action: "badge.award",
    entityType: "user_badge",
    entityId: data?.id ?? null,
    communityId: entry.communityId,
    metadata: { badge_id: entry.badgeId, address },
  });

  return data;
}

/** All badges a wallet has earned, optionally scoped to one community. */
export async function listUserBadges(
  address: string,
  communityId?: string,
) {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("user_badges")
    .select("*, badges:badge_id (slug, name, description, icon, community_id)")
    .eq("address", normalizeAddress(address))
    .order("awarded_at", { ascending: false });
  if (communityId) query = query.eq("community_id", communityId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
