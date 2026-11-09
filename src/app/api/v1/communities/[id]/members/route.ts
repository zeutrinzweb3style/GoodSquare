import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { notFound, ok, serverError } from "@/lib/api/response";

/** List members of a community. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/members">,
) {
  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);

    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("community_members")
      .select(
        "address, role, joined_at, profiles:address (username, display_name, avatar_url)",
      )
      .eq("community_id", community.id)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("list members error", error);
      return serverError("Could not load members");
    }

    return ok({ members: data ?? [] });
  } catch (error) {
    console.error("members error", error);
    return serverError("Could not load members");
  }
}
