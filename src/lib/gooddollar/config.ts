/**
 * GoodDollar integration configuration.
 *
 * Everything here is pure and framework-free so it can be unit tested and
 * imported from both server and client modules without pulling in the SDK.
 *
 * IMPORTANT — mainnet only. The GoodDollar contracts are deployed on Celo
 * mainnet (42220), Fuse (122), and XDC (50). There is no Celo Sepolia
 * deployment, so this integration is gated to Celo mainnet and stays hidden
 * everywhere else. Addresses below were read from the official
 * `@goodsdks/citizen-sdk` constants (chainConfigs[SupportedChains.CELO]
 * .contracts.production) and should be re-checked against the GoodProtocol
 * deployment manifest before any production financial use.
 */

/** Celo mainnet. GoodDollar has no testnet deployment, so this is the only chain we allow. */
export const GOODDOLLAR_CELO_CHAIN_ID = 42220;

/** GoodDollar contract environment. "production" is the live mainnet set. */
export const GOODDOLLAR_ENV = "production" as const;

export type GoodDollarEnv = typeof GOODDOLLAR_ENV;

/** Verified Celo mainnet contract addresses (source: @goodsdks/citizen-sdk). */
export const GOODDOLLAR_CELO_CONTRACTS = {
  identity: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
  ubi: "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1",
  faucet: "0x4F93Fa058b03953C851eFaA2e4FC5C34afDFAb84",
  gDollar: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
} as const;

/** GoodDollar production web surfaces (source: @goodsdks/citizen-sdk Envs). */
export const GOODDOLLAR_URLS = {
  wallet: "https://wallet.gooddollar.org",
  identity: "https://goodid.gooddollar.org",
} as const;

/** G$ uses 18 decimals on Celo. */
export const G_DOLLAR_DECIMALS = 18;

/**
 * G$'s symbol in the Square Treasury / Square Pay token registry
 * (`@/lib/treasury/tokens`). Kept here so GoodDollar code never hardcodes it.
 */
export const G_DOLLAR_TOKEN_ID = "G$";

/**
 * Whether the GoodDollar integration can run against the given chain id.
 * Only Celo mainnet is supported; every other network (including Celo
 * Sepolia) returns false so callers can hide or disable the feature.
 */
export function isGoodDollarSupportedChain(
  chainId: number | null | undefined,
): boolean {
  return chainId === GOODDOLLAR_CELO_CHAIN_ID;
}

/** Human-readable reason the feature is unavailable, for empty states. */
export function unsupportedChainReason(
  chainId: number | null | undefined,
): string {
  if (chainId == null) {
    return "Connect your wallet to check GoodDollar eligibility.";
  }
  return "GoodDollar runs on Celo mainnet only, and it has no testnet deployment. Switch your wallet to Celo to verify your identity and claim G$.";
}

/** Block explorer link for an address. */
export function celoAddressUrl(address: string): string {
  return `https://celoscan.io/address/${address}`;
}

/** Block explorer link for a transaction. */
export function celoTxUrl(hash: string): string {
  return `https://celoscan.io/tx/${hash}`;
}

/** Formats a base-unit integer amount into a human string with the given decimals. */
export function formatUnits(
  value: bigint,
  decimals: number = G_DOLLAR_DECIMALS,
): string {
  if (decimals < 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fractionStr ? `${sign}${whole}.${fractionStr}` : `${sign}${whole}`;
}

/** Claim status as reported by the GoodDollar ClaimSDK. */
export type ClaimStatus = "not_whitelisted" | "can_claim" | "already_claimed";

export interface ClaimStatusCopy {
  label: string;
  tone: "warning" | "success" | "muted";
}

/** Maps a claim status to user-facing copy. Pure so it can be unit tested. */
export function describeClaimStatus(status: ClaimStatus): ClaimStatusCopy {
  switch (status) {
    case "not_whitelisted":
      return { label: "Not verified yet", tone: "warning" };
    case "can_claim":
      return { label: "Ready to claim", tone: "success" };
    case "already_claimed":
      return { label: "Already claimed today", tone: "muted" };
  }
}
