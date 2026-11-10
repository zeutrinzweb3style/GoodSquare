/**
 * Celo token registry — Square Treasury and Square Pay.
 *
 * Only tokens listed here can be displayed, requested, or paid. Each entry was
 * verified against authoritative sources before being committed:
 *
 *   * Celo mainnet addresses and decimals confirmed on-chain via
 *     `forno.celo.org` (eth_call decimals()) and cross-checked against the
 *     official `celo-org/celo-token-list`.
 *   * Celo Sepolia addresses confirmed on-chain via
 *     `forno.celo-sepolia.celo-testnet.org` and cross-checked against the Celo
 *     Sepolia block explorer (Blockscout). Unverified "Mock …" tokens are
 *     deliberately excluded.
 *
 * Note: the proposal names "cUSD"; that stablecoin is now Mento Dollar (USDm)
 * and lives at the same contract address. It is kept under the `cUSD` id with
 * the current symbol so existing references keep working.
 *
 * G$ (GoodDollar) is the UBI token. Its Celo mainnet address was read from the
 * official GoodDollar docs (docs.gooddollar.org, "How to integrate the G$
 * token", production Celo). GoodDollar has no Celo Sepolia deployment, so G$ is
 * listed there with a null contract and is filtered out of `payableTokens`.
 *
 * This registry is intentionally static: a token can never be selected from
 * client input, which removes a class of spoofing attacks. Adding a token means
 * editing this file after verifying it.
 */

export type TokenSymbol = "CELO" | "cUSD" | "USDC" | "USDT" | "G$";

export interface Token {
  /** Stable identifier used across the app and stored in the database. */
  id: TokenSymbol;
  /** Display symbol. */
  symbol: TokenSymbol;
  name: string;
  /**
   * ERC-20 contract address, checksummed. `null` for the native CELO gas token,
   * which has no contract.
   */
  contract: string | null;
  decimals: number;
  /** Native CELO is transferred with `value`, not `transfer`. */
  native: boolean;
  /** Short note shown in the UI. */
  note: string;
}

const MAINNET: Record<TokenSymbol, Token> = {
  CELO: {
    id: "CELO",
    symbol: "CELO",
    name: "Celo",
    contract: null,
    decimals: 18,
    native: true,
    note: "Native gas token",
  },
  cUSD: {
    id: "cUSD",
    symbol: "cUSD",
    name: "Mento Dollar (formerly cUSD)",
    contract: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    native: false,
    note: "Celo-native stablecoin",
  },
  USDC: {
    id: "USDC",
    symbol: "USDC",
    name: "USD Coin",
    contract: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    native: false,
    note: "Bridged USDC",
  },
  USDT: {
    id: "USDT",
    symbol: "USDT",
    name: "Tether USD",
    contract: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    native: false,
    note: "Bridged USDT",
  },
  "G$": {
    id: "G$",
    symbol: "G$",
    name: "GoodDollar",
    contract: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    decimals: 18,
    native: false,
    note: "GoodDollar UBI token",
  },
};

const SEPOLIA: Record<TokenSymbol, Token> = {
  CELO: {
    id: "CELO",
    symbol: "CELO",
    name: "Celo",
    contract: null,
    decimals: 18,
    native: true,
    note: "Native gas token (testnet)",
  },
  cUSD: {
    id: "cUSD",
    symbol: "cUSD",
    name: "Mento Dollar (testnet)",
    contract: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
    decimals: 18,
    native: false,
    note: "Testnet stablecoin",
  },
  USDC: {
    id: "USDC",
    symbol: "USDC",
    name: "USD Coin (testnet)",
    contract: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    decimals: 6,
    native: false,
    note: "Testnet USDC",
  },
  USDT: {
    id: "USDT",
    symbol: "USDT",
    name: "Tether USD (testnet)",
    contract: null,
    decimals: 6,
    native: false,
    note: "Not deployed on Celo Sepolia",
  },
  "G$": {
    id: "G$",
    symbol: "G$",
    name: "GoodDollar (testnet)",
    contract: null,
    decimals: 18,
    native: false,
    note: "GoodDollar has no Celo Sepolia deployment",
  },
};

export const TOKEN_SYMBOLS: TokenSymbol[] = ["CELO", "cUSD", "USDC", "USDT", "G$"];

const REGISTRIES: Record<number, Record<TokenSymbol, Token>> = {
  42220: MAINNET,
  11142220: SEPOLIA,
};

export const SUPPORTED_CHAIN_IDS = Object.keys(REGISTRIES).map(Number);

/** The chain the app targets by default (mainnet unless configured otherwise). */
export function defaultChainId(): number {
  const configured = Number(process.env.NEXT_PUBLIC_CELO_CHAIN_ID);
  if (chainSupportsTokens(configured)) return configured;
  return 42220;
}

export function chainSupportsTokens(
  chainId: number | null | undefined,
): boolean {
  return chainId != null && chainId in REGISTRIES;
}

/** All tokens for a chain, including those not yet deployed (contract null). */
export function listTokens(chainId: number): Token[] {
  const registry = REGISTRIES[chainId];
  if (!registry) return [];
  return TOKEN_SYMBOLS.map((symbol) => registry[symbol]);
}

/** Tokens that can actually be paid on a chain. */
export function payableTokens(chainId: number): Token[] {
  return listTokens(chainId).filter((token) => token.native || token.contract);
}

export function getToken(
  chainId: number,
  symbol: string | null | undefined,
): Token | null {
  if (!symbol) return null;
  const registry = REGISTRIES[chainId];
  if (!registry) return null;
  return registry[symbol as TokenSymbol] ?? null;
}

export function isPayable(
  chainId: number,
  symbol: string | null | undefined,
): boolean {
  const token = getToken(chainId, symbol);
  return Boolean(token && (token.native || token.contract));
}

export function tokenDecimals(
  chainId: number,
  symbol: string,
): number | null {
  return getToken(chainId, symbol)?.decimals ?? null;
}

export function isNativeToken(
  chainId: number,
  symbol: string | null | undefined,
): boolean {
  return Boolean(getToken(chainId, symbol)?.native);
}
