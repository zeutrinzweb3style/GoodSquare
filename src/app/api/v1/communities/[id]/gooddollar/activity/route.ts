import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getGdollarActivity } from "@/lib/gooddollar/activity";
import { G_DOLLAR_DECIMALS } from "@/lib/gooddollar/config";
import { formatAmount } from "@/lib/treasury/amounts";
import { notFound, ok, serverError } from "@/lib/api/response";

/**
 * Verified G$ activity for a community: users, transactions and G$ volume.
 *
 * These are the numbers GoodBuilders asks teams to report, derived only from
 * rows that were verified on-chain. Public for public communities; members only
 * for private ones. Amounts are returned both in base units and as human G$
 * strings so any client renders them identically.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/gooddollar/activity">,
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

    const summary = await getGdollarActivity(community.id);
    const asGdollar = (value: bigint) =>
      formatAmount(value, G_DOLLAR_DECIMALS);

    return ok({
      communityId: community.id,
      tokenSymbol: "G$",
      decimals: G_DOLLAR_DECIMALS,
      uniqueWallets: summary.uniqueWallets,
      transactions: summary.transactions,
      volume: {
        base: summary.volume.toString(),
        gdollar: asGdollar(summary.volume),
      },
      payments: {
        count: summary.payments.count,
        volume: {
          base: summary.payments.volume.toString(),
          gdollar: asGdollar(summary.payments.volume),
        },
      },
      rewards: {
        paidCount: summary.rewards.paidCount,
        volume: {
          base: summary.rewards.paidVolume.toString(),
          gdollar: asGdollar(summary.rewards.paidVolume),
        },
      },
      treasury: {
        in: asGdollar(summary.treasury.inVolume),
        out: asGdollar(summary.treasury.outVolume),
      },
    });
  } catch (error) {
    console.error("gooddollar activity error", error);
    return serverError("Could not load G$ activity");
  }
}
