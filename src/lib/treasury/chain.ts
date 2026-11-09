import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
} from "viem";
import { celo, celoSepolia } from "viem/chains";
import { getToken } from "./tokens";

/**
 * Minimal read-only Celo client. Used to read treasury balances and to fetch
 * transaction receipts for verification. It never signs or sends anything.
 */

const CHAINS = {
  42220: celo,
  11142220: celoSepolia,
} as const;

const RPC_URLS: Record<number, string | undefined> = {
  42220: process.env.NEXT_PUBLIC_CELO_RPC_URL,
  11142220: process.env.NEXT_PUBLIC_CELO_SEPOLIA_RPC_URL,
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAINS;
}

function clientFor(chainId: number) {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) return null;
  return createPublicClient({
    chain,
    transport: http(RPC_URLS[chainId] || undefined),
  });
}

export interface ReceiptLike {
  status: "success" | "reverted";
  blockNumber: bigint | null;
  logs: { address: string; topics: string[]; data: string }[];
}

export interface TxLike {
  from: string;
  to: string | null;
  value: bigint;
}

/** Fetch a transaction receipt, or null when the hash is unknown/unsupported. */
export async function getReceipt(
  chainId: number,
  hash: string,
): Promise<ReceiptLike | null> {
  const client = clientFor(chainId);
  if (!client) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  try {
    const receipt = await client.getTransactionReceipt({
      hash: hash as `0x${string}`,
    });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber ?? null,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
      })),
    };
  } catch {
    return null;
  }
}

/** Fetch a transaction's sender, recipient, and value. */
export async function getTransaction(
  chainId: number,
  hash: string,
): Promise<TxLike | null> {
  const client = clientFor(chainId);
  if (!client) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  try {
    const tx = await client.getTransaction({ hash: hash as `0x${string}` });
    return { from: tx.from, to: tx.to, value: tx.value };
  } catch {
    return null;
  }
}

/** ERC-20 balance in base units, or null when it cannot be read. */
export async function getErc20Balance(
  chainId: number,
  tokenSymbol: string,
  owner: string,
): Promise<bigint | null> {
  const client = clientFor(chainId);
  const token = getToken(chainId, tokenSymbol);
  if (!client || !token?.contract || !isAddress(owner)) return null;
  try {
    return await client.readContract({
      address: token.contract as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner as `0x${string}`],
    });
  } catch {
    return null;
  }
}

/** Native CELO balance in wei, or null when it cannot be read. */
export async function getNativeBalance(
  chainId: number,
  owner: string,
): Promise<bigint | null> {
  const client = clientFor(chainId);
  if (!client || !isAddress(owner)) return null;
  try {
    return await client.getBalance({ address: owner as `0x${string}` });
  } catch {
    return null;
  }
}
