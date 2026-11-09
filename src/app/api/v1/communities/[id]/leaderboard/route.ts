import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getLeaderboard } from "@/lib/reputation/service";
import { leaderboardQuerySchema } from "@/lib/validation/schemas";
import {
  notFound,
  ok,
  serverError,
  validationError,
} from "@/lib/api/response";

/**
 * Community EXP leaderboard. `period` selects all-time, weekly (last 7 days),
 * or monthly (last 30 days) rankings.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/leaderboard">,
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const parsed = leaderboardQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return validationError(parsed.error);
  }

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

    const entries = await getLeaderboard(community.id, parsed.data);
    return ok({
      period: parsed.data.period,
      community: { id: community.id, slug: community.slug, name: community.name },
      entries,
    });
  } catch (error) {
    console.error("leaderboard error", error);
    return serverError("Could not load leaderboard");
  }
}
