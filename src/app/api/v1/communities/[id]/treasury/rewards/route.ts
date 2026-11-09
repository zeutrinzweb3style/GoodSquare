import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { createRewardDistributionSchema } from "@/lib/validation/schemas";
import {
  RewardError,
  createRewardDistribution,
  listRewardDistributions,
} from "@/lib/rewards/service";
import { getTreasuryByCommunity } from "@/lib/treasury/service";
import { getToken, isPayable } from "@/lib/treasury/tokens";
import { parseAmount } from "@/lib/treasury/amounts";
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

/** List a community's reward distributions. Members only for private ones. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/rewards">,
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

    const distributions = await listRewardDistributions(community.id);
    return ok({ distributions });
  } catch (error) {
    console.error("list reward distributions error", error);
    return serverError("Could not load reward distributions");
  }
}

/** Create a reward distribution. Requires reward:distribute. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/rewards">,
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

  const parsed = createRewardDistributionSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "reward:distribute")) {
      return forbidden("You cannot distribute rewards for this community");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");

    const { tokenSymbol } = parsed.data;
    if (!isPayable(treasury.chain_id, tokenSymbol)) {
      return badRequest("That token is not supported on this treasury's network");
    }
    const token = getToken(treasury.chain_id, tokenSymbol)!;

    const recipients = parsed.data.recipients.map((recipient) => {
      const amount = parseAmount(recipient.amount, token.decimals);
      if (amount === null || amount <= 0n) {
        throw new RewardError(
          `Enter a valid ${token.symbol} amount with at most ${token.decimals} decimals`,
          "invalid",
        );
      }
      return { address: recipient.address, amount: amount.toString() };
    });

    const distribution = await createRewardDistribution({
      treasury,
      title: parsed.data.title,
      description: parsed.data.description || null,
      tokenSymbol,
      recipients,
      createdBy: session.sub,
    });

    return created(distribution);
  } catch (error) {
    if (error instanceof RewardError) return badRequest(error.message);
    console.error("create reward distribution error", error);
    return serverError("Could not create the reward distribution");
  }
}
