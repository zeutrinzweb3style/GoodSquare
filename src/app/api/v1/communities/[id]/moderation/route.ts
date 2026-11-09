import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { listCommunitySubmissions } from "@/lib/quest/service";
import {
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api/response";

/** Pending-submission queue for moderators. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/moderation">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "pending" ||
    statusParam === "approved" ||
    statusParam === "rejected"
      ? statusParam
      : "pending";

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "quest:moderate")) {
      return forbidden("You cannot moderate this community");
    }

    const submissions = await listCommunitySubmissions(community.id, { status });
    return ok({ submissions });
  } catch (error) {
    console.error("moderation queue error", error);
    return serverError("Could not load the moderation queue");
  }
}
