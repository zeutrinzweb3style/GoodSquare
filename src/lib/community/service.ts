import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { hasAtLeastRole, roleHasPermission, type CommunityRole, type Permission } from "@/lib/permissions";
import type { Community, CommunityMember } from "@/lib/types";

export interface CommunityRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  visibility: "public" | "private";
  creator_address: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export async function getCommunityBySlugOrId(
  slugOrId: string,
): Promise<CommunityRow | null> {
  const supabase = createServiceRoleClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slugOrId,
    );
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq(isUuid ? "id" : "slug", isUuid ? slugOrId : slugOrId.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMembership(
  communityId: string,
  address: string,
): Promise<CommunityMember | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRole(
  communityId: string,
  address: string | null | undefined,
): Promise<CommunityRole | null> {
  if (!address) return null;
  const membership = await getMembership(communityId, address);
  return (membership?.role as CommunityRole) ?? null;
}

export function can(role: CommunityRole | null, permission: Permission): boolean {
  return roleHasPermission(role, permission);
}

export function atLeast(role: CommunityRole | null, minimum: CommunityRole): boolean {
  return hasAtLeastRole(role, minimum);
}

export async function writeAuditLog(entry: {
  actor: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  communityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServiceRoleClient();
  await supabase.from("audit_logs").insert({
    actor: entry.actor,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    community_id: entry.communityId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export function serializeCommunity(
  row: CommunityRow,
  membershipRole: CommunityRole | null,
): Community & { membership_role: CommunityRole | null } {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logo_url: row.logo_url,
    banner_url: row.banner_url,
    visibility: row.visibility,
    creator_address: row.creator_address,
    member_count: row.member_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    membership_role: membershipRole,
  };
}
