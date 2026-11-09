import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getCommunityBySlugOrId,
  getRole,
  serializeCommunity,
} from "@/lib/community/service";
import { notFound, ok, serverError } from "@/lib/api/response";

/** Community detail. Private communities are visible to members only. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]">,
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

    return ok(serializeCommunity(community, role));
  } catch (error) {
    console.error("community detail error", error);
    return serverError("Could not load community");
  }
}
