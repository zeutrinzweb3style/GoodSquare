import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import {
  getCommunityBySlugOrId,
  getMembership,
  writeAuditLog,
} from "@/lib/community/service";
import { normalizeAddress } from "@/lib/auth/wallet";
import {
  conflict,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api/response";

/** Join a public community as a member. */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/join">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }
    if (community.visibility === "private") {
      return forbidden("This community is private and requires an invitation");
    }

    const address = normalizeAddress(session.sub);
    const existing = await getMembership(community.id, address);
    if (existing) {
      return conflict("You are already a member of this community");
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("community_members")
      .insert({ community_id: community.id, address, role: "member" })
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return conflict("You are already a member of this community");
      }
      console.error("join community error", error);
      return serverError("Could not join community");
    }

    await writeAuditLog({
      actor: address,
      action: "community.join",
      entityType: "community_member",
      entityId: data?.id ?? null,
      communityId: community.id,
    });

    return ok({ membership: data });
  } catch (error) {
    console.error("join error", error);
    return serverError("Could not join community");
  }
}

/** Leave a community. Owners cannot leave their own community. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/join">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const address = normalizeAddress(session.sub);
    const membership = await getMembership(community.id, address);
    if (!membership) {
      return notFound("You are not a member of this community");
    }
    if (membership.role === "owner") {
      return forbidden("Owners cannot leave their own community");
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("community_members")
      .delete()
      .eq("id", membership.id);

    if (error) {
      console.error("leave community error", error);
      return serverError("Could not leave community");
    }

    await writeAuditLog({
      actor: address,
      action: "community.leave",
      entityType: "community_member",
      entityId: membership.id,
      communityId: community.id,
    });

    return ok({ left: true });
  } catch (error) {
    console.error("leave error", error);
    return serverError("Could not leave community");
  }
}
