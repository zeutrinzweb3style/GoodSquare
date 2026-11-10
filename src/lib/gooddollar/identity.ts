import { createPublicClient, http, isAddress, type Address } from "viem";
import { celo } from "viem/chains";
import {
  chainConfigs,
  identityV2ABI,
  SupportedChains,
} from "@goodsdks/citizen-sdk";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  isGoodDollarSupportedChain,
} from "./config";

/**
 * Read-only GoodDollar identity lookups.
 *
 * This helper never holds a wallet or signs anything — it only reads public
 * chain state, so it is safe to call from an unauthenticated route. The
 * write path (face verification, UBI claim) stays in the browser, where the
 * user's own wallet signs.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

export interface IdentityStatus {
  chainId: number;
  /** The wallet passed in, checksummed. */
  address: string;
  /** True when the address (or a wallet linked to it) is verified as a GoodDollar citizen. */
  isWhitelisted: boolean;
  /** Root identity address that owns the verification. */
  root: string;
  /** Unix seconds of the last successful face verification, if known. */
  lastAuthenticated: number | null;
  /** Verification validity period in seconds, if known. */
  authenticationPeriod: number | null;
}

function publicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || undefined),
  });
}

/** Identity contract address for Celo mainnet production, or null if missing. */
function identityAddress(): Address | null {
  const contracts =
    chainConfigs[SupportedChains.CELO]?.contracts?.[GOODDOLLAR_ENV];
  return (contracts?.identityContract as Address | undefined) ?? null;
}

/**
 * Reads the GoodDollar identity status for a wallet on Celo mainnet.
 * Returns null when the address is malformed or the chain is unsupported.
 */
export async function getIdentityStatus(
  address: string,
  chainId: number = GOODDOLLAR_CELO_CHAIN_ID,
): Promise<IdentityStatus | null> {
  if (!isAddress(address)) return null;
  if (!isGoodDollarSupportedChain(chainId)) return null;

  const contractAddress = identityAddress();
  if (!contractAddress) return null;

  const client = publicClient();
  const account = address as Address;

  const [root, lastAuthenticated, authenticationPeriod] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: identityV2ABI,
      functionName: "getWhitelistedRoot",
      args: [account],
    }),
    client
      .readContract({
        address: contractAddress,
        abi: identityV2ABI,
        functionName: "lastAuthenticated",
        args: [account],
      })
      .catch(() => 0n),
    client
      .readContract({
        address: contractAddress,
        abi: identityV2ABI,
        functionName: "authenticationPeriod",
        args: [],
      })
      .catch(() => 0n),
  ]);

  const rootAddress = (root as Address) ?? ZERO;
  const isWhitelisted = rootAddress !== ZERO;

  return {
    chainId,
    address: account,
    isWhitelisted,
    root: rootAddress,
    lastAuthenticated:
      lastAuthenticated > 0n ? Number(lastAuthenticated) : null,
    authenticationPeriod:
      authenticationPeriod > 0n ? Number(authenticationPeriod) : null,
  };
}
