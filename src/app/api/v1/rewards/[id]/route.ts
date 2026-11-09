import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { updateRewardDistributionSchema } from "@/lib/validation/schemas";
import {
  RewardError,
  getDistributionProgress,
  getRewardDistributionById,
  listRewardRecipients,
  updateRewardDistribution,
} from "@/lib/rewards/service";
import { getTreasuryById } from "@/lib/treasury/service";
import { getToken } from "@/lib/treasury/tokens";
import { formatAmount } from "@/lib/treasury/amounts";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/**
 * A reward distribution with its recipients. A recipient sees their own row;
 * otherwise members of the community (or anyone, for public communities) see
 * the plan, which is part of the transparency record.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/rewards/[id]">,
) {
  const { id } = await ctx.params;
  try {
    const distribution = await getRewardDistributionById(id);
    if (!distribution) return notFound("Reward distribution not found");

    const session = await getSession();
    const isRecipient = session
      ? (await listRewardRecipients(distribution.id)).some(
          (recipient) => recipient.address === session.sub,
        )
      : false;

    const community = await getCommunityBySlugOrId(distribution.community_id);
    const role = await getRole(distribution.community_id, session?.sub);
    const canView =
      isRecipient ||
      community?.visibility === "public" ||
      Boolean(role);
    if (!canView) return notFound("Reward distribution not found");

    const [recipients, progress] = await Promise.all([
      listRewardRecipients(distribution.id),
      getDistributionProgress(distribution.id),
    ]);

    const token = getToken(
      (await getTreasuryById(distribution.treasury_id))?.chain_id ?? 42220,
      distribution.token_symbol,
    );

    return ok({
      distribution,
      recipients,
      progress: {
        paid: progress.paid,
        total: progress.total,
        outstanding: progress.outstanding.toString(),
        outstandingDisplay: token
          ? formatAmount(progress.outstanding, token.decimals)
          : progress.outstanding.toString(),
      },
    });
  } catch (error) {
    console.error("get reward distribution error", error);
    return serverError("Could not load the reward distribution");
  }
}

/** Activate, cancel, or complete a distribution. Requires reward:distribute. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/rewards/[id]">,
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

  const parsed = updateRewardDistributionSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const distribution = await getRewardDistributionById(id);
    if (!distribution) return notFound("Reward distribution not found");

    const role = await getRole(distribution.community_id, session.sub);
    if (!can(role, "reward:distribute")) {
      return forbidden("You cannot manage rewards for this community");
    }

    const updated = await updateRewardDistribution(
      distribution,
      parsed.data.status,
      session.sub,
    );
    return ok(updated);
  } catch (error) {
    if (error instanceof RewardError) {
      if (error.code === "conflict") return conflict(error.message);
      return badRequest(error.message);
    }
    console.error("update reward distribution error", error);
    return serverError("Could not update the reward distribution");
  }
}
