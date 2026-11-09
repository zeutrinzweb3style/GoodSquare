import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { isValidAddress, normalizeAddress } from "@/lib/auth/wallet";

/**
 * Reputation endpoint placeholder (Square Reputation, Phase 2).
 *
 * EXP, badges, and leaderboards are not implemented in the Foundation release.
 * We return 501 rather than mock data so integrations never mistake a stub for
 * real on-chain reputation.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/reputation/[wallet]">,
) {
  const { wallet } = await ctx.params;
  if (!isValidAddress(wallet)) {
    return apiError(400, "INVALID_ADDRESS", "A valid wallet address is required");
  }

  return apiError(
    501,
    "NOT_IMPLEMENTED",
    `Reputation for ${normalizeAddress(wallet)} is not available yet. Square Reputation ships in Phase 2.`,
  );
}
