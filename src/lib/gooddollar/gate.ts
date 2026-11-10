import { getIdentityStatus } from "./identity";
import { evaluateCitizenship, type CitizenshipResult } from "./eligibility";
import { GOODDOLLAR_CELO_CHAIN_ID } from "./config";

/**
 * Server-side "verified humans only" gate.
 *
 * Reads the on-chain GoodDollar identity registry for a wallet and reports
 * whether it belongs to a currently verified human. Read-only and safe to call
 * from a session-authenticated route.
 */
export async function checkVerifiedHuman(
  address: string,
  chainId: number = GOODDOLLAR_CELO_CHAIN_ID,
): Promise<CitizenshipResult> {
  const status = await getIdentityStatus(address, chainId);
  return evaluateCitizenship(status);
}
