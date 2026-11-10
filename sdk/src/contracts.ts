/**
 * Smart contract interfaces for Good Square integrations.
 *
 * Good Square is non-custodial: it deploys no contracts of its own and holds no
 * keys. Every on-chain action is an ordinary ERC-20 `transfer` (or a native
 * CELO send) signed by the user's own wallet. These ABIs and the token registry
 * are therefore the complete on-chain surface an integration needs.
 *
 * The token addresses mirror the server-side registry in
 * `src/lib/treasury/tokens.ts` and were verified against the official
 * `celo-org/celo-token-list` and the Celo block explorers.
 */

/** Human-readable ERC-20 ABI, suitable for `viem`'s `parseAbi`. */
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

/** The ERC-20 `Transfer` event topic, for filtering receipts. */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type TokenSymbol = "CELO" | "cUSD" | "USDC" | "USDT";

export interface TokenInfo {
  symbol: TokenSymbol;
  name: string;
  /** ERC-20 address, or null for native CELO. */
  contract: `0x${string}` | null;
  decimals: number;
  native: boolean;
}

export const CELO_MAINNET_CHAIN_ID = 42220;
export const CELO_SEPOLIA_CHAIN_ID = 11142220;

export const TOKENS: Record<number, Record<TokenSymbol, TokenInfo>> = {
  [CELO_MAINNET_CHAIN_ID]: {
    CELO: { symbol: "CELO", name: "Celo", contract: null, decimals: 18, native: true },
    cUSD: {
      symbol: "cUSD",
      name: "Mento Dollar (formerly cUSD)",
      contract: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      decimals: 18,
      native: false,
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      contract: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      decimals: 6,
      native: false,
    },
    USDT: {
      symbol: "USDT",
      name: "Tether USD",
      contract: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      decimals: 6,
      native: false,
    },
  },
  [CELO_SEPOLIA_CHAIN_ID]: {
    CELO: { symbol: "CELO", name: "Celo", contract: null, decimals: 18, native: true },
    cUSD: {
      symbol: "cUSD",
      name: "Mento Dollar (testnet)",
      contract: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
      decimals: 18,
      native: false,
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin (testnet)",
      contract: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
      decimals: 6,
      native: false,
    },
    USDT: {
      symbol: "USDT",
      name: "Tether USD (testnet)",
      contract: null,
      decimals: 6,
      native: false,
    },
  },
};

/** Tokens that can be transferred on a chain (native or with a contract). */
export function payableTokens(chainId: number): TokenInfo[] {
  const registry = TOKENS[chainId];
  if (!registry) return [];
  return Object.values(registry).filter((token) => token.native || token.contract);
}

export function getToken(
  chainId: number,
  symbol: string,
): TokenInfo | null {
  return TOKENS[chainId]?.[symbol as TokenSymbol] ?? null;
}
