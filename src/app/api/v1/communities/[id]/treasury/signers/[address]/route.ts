import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import {
  SpendingError,
  getTreasuryByCommunity,
  removeTreasurySigner,
} from "@/lib/treasury/service";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api/response";

/** Remove a treasury signer. Requires treasury:manage. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/signers/[address]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id, address } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:manage")) {
      return forbidden("You cannot manage this community's treasury");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");

    await removeTreasurySigner({ treasury, address, actor: session.sub });
    return ok({ removed: true });
  } catch (error) {
    if (error instanceof SpendingError) return badRequest(error.message);
    console.error("remove treasury signer error", error);
    return serverError("Could not remove the signer");
  }
}
