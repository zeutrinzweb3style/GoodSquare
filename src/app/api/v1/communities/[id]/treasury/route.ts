import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { createTreasurySchema, updateTreasurySchema } from "@/lib/validation/schemas";
import {
  createTreasury,
  getTreasuryBalances,
  getTreasuryByCommunity,
  listTreasuryTransactions,
  updateTreasury,
} from "@/lib/treasury/service";
import { defaultChainId, payableTokens } from "@/lib/treasury/tokens";
import {
  badRequest,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/**
 * The community treasury, its live balances, and the tokens it can hold.
 * Public for public communities; members only for private ones.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury">,
) {
  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    const chainId = treasury?.chain_id ?? defaultChainId();
    const tokens = payableTokens(chainId);
    const balances = treasury ? await getTreasuryBalances(treasury) : [];
    const transactions = treasury
      ? await listTreasuryTransactions(treasury.id, { limit: 50 })
      : [];

    return ok({ treasury, balances, transactions, tokens, chainId });
  } catch (error) {
    console.error("get treasury error", error);
    return serverError("Could not load the treasury");
  }
}

/** Create the community treasury. Requires treasury:manage. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createTreasurySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:manage")) {
      return forbidden("You cannot manage this community's treasury");
    }

    const existing = await getTreasuryByCommunity(community.id);
    if (existing) {
      return badRequest("This community already has a treasury");
    }

    const treasury = await createTreasury({
      communityId: community.id,
      name: parsed.data.name,
      address: parsed.data.address || null,
      chainId: parsed.data.chainId ?? defaultChainId(),
      isActive: parsed.data.isActive,
      createdBy: session.sub,
    });

    return created(treasury);
  } catch (error) {
    console.error("create treasury error", error);
    return serverError("Could not create the treasury");
  }
}

/** Update the treasury reference. Requires treasury:manage. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = updateTreasurySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:manage")) {
      return forbidden("You cannot manage this community's treasury");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");

    const updated = await updateTreasury(
      treasury,
      {
        name: parsed.data.name,
        address:
          parsed.data.address === undefined
            ? undefined
            : parsed.data.address || null,
        isActive: parsed.data.isActive,
        approvalThreshold: parsed.data.approvalThreshold,
      },
      session.sub,
    );

    return ok(updated);
  } catch (error) {
    console.error("update treasury error", error);
    return serverError("Could not update the treasury");
  }
}
