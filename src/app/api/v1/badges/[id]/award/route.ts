import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { normalizeAddress } from "@/lib/auth/wallet";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { awardBadge, getBadge } from "@/lib/reputation/badges";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { awardBadgeSchema } from "@/lib/validation/schemas";
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** Award a badge to a wallet. Requires the reputation:award permission. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/badges/[id]/award">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = awardBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    // Badge ids are globally unique, so we can resolve the community from the
    // badge itself and then check the caller's role in that community.
    const supabase = createServiceRoleClient();
    const { data: badgeRow, error } = await supabase
      .from("badges")
      .select("id, community_id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("load badge error", error);
      return serverError("Could not load badge");
    }
    if (!badgeRow) {
      return notFound("Badge not found");
    }

    const community = await getCommunityBySlugOrId(badgeRow.community_id);
    if (!community) {
      return notFound("Badge not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "reputation:award")) {
      return forbidden("You cannot award badges in this community");
    }

    const badge = await getBadge(community.id, id);
    if (!badge) {
      return notFound("Badge not found");
    }

    const userBadge = await awardBadge({
      badgeId: id,
      communityId: community.id,
      address: parsed.data.address,
      awardedBy: session.sub,
    });

    return created({ ...userBadge, address: normalizeAddress(parsed.data.address) });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return conflict("This wallet already has that badge");
    }
    console.error("award badge error", error);
    return serverError("Could not award badge");
  }
}
