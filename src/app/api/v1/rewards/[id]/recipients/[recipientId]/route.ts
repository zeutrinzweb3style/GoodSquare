import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getRole } from "@/lib/community/service";
import { payRewardRecipientSchema } from "@/lib/validation/schemas";
import {
  RewardError,
  getRewardDistributionById,
  getRewardRecipientById,
  payRewardRecipient,
} from "@/lib/rewards/service";
import { getTreasuryById } from "@/lib/treasury/service";
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
 * Record that a reward recipient was paid. A treasury signer already sent the
 * transfer from the treasury wallet; the backend verifies the receipt against
 * the recipient's amount before marking them paid. It never sends funds.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/rewards/[id]/recipients/[recipientId]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id, recipientId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = payRewardRecipientSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const distribution = await getRewardDistributionById(id);
    if (!distribution) return notFound("Reward distribution not found");

    const role = await getRole(distribution.community_id, session.sub);
    if (!can(role, "reward:distribute")) {
      return forbidden("You cannot manage rewards for this community");
    }

    const treasury = await getTreasuryById(distribution.treasury_id);
    if (!treasury) return notFound("Treasury not found");

    const recipient = await getRewardRecipientById(recipientId);
    if (!recipient || recipient.distribution_id !== distribution.id) {
      return notFound("Recipient not found");
    }

    const paid = await payRewardRecipient({
      distribution,
      treasury,
      recipient,
      txHash: parsed.data.txHash,
      actor: session.sub,
    });

    return ok(paid);
  } catch (error) {
    if (error instanceof RewardError) {
      if (error.code === "conflict") return conflict(error.message);
      return badRequest(error.message);
    }
    console.error("pay reward recipient error", error);
    return serverError("Could not record the payout");
  }
}
