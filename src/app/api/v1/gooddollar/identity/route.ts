import type { NextRequest } from "next/server";
import { isValidAddress } from "@/lib/auth/wallet";
import { badRequest, ok, serverError } from "@/lib/api/response";
import { getIdentityStatus } from "@/lib/gooddollar/identity";
import { isGoodDollarSupportedChain } from "@/lib/gooddollar/config";

/**
 * Public GoodDollar identity status for a wallet on Celo mainnet.
 *
 * Read-only: it reflects the on-chain identity registry and needs no session.
 * The response is intentionally small so it can be polled after a face
 * verification redirect completes.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const chainIdParam = request.nextUrl.searchParams.get("chainId");

  if (!address || !isValidAddress(address)) {
    return badRequest("A valid wallet address is required");
  }

  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  if (chainId !== undefined && !Number.isFinite(chainId)) {
    return badRequest("chainId must be a number");
  }
  if (chainId !== undefined && !isGoodDollarSupportedChain(chainId)) {
    return ok({
      supported: false,
      reason:
        "GoodDollar is only available on Celo mainnet and has no testnet deployment.",
    });
  }

  try {
    const status = await getIdentityStatus(address, chainId);
    if (!status) {
      return ok({ supported: false, reason: "Unsupported address or chain." });
    }
    return ok({ supported: true, ...status });
  } catch (error) {
    console.error("gooddollar identity lookup failed", error);
    return serverError("Could not read GoodDollar identity status");
  }
}
