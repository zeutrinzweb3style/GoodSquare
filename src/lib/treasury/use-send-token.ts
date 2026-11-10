"use client";

import { useCallback } from "react";
import {
  useChainId,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { parseAbi } from "viem";
import { getToken } from "@/lib/treasury/tokens";
import type { SupportedChainId } from "@/lib/wagmi/config";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

/**
 * Send a token transfer from the connected wallet. Native CELO is sent as a
 * value transfer; ERC-20 tokens are sent with `transfer`. Returns the
 * transaction hash. The wallet signs; Good Square never does.
 */
export function useSendToken() {
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  return useCallback(
    async (params: {
      chainId: number;
      tokenSymbol: string;
      to: string;
      /** Amount in base units, as a decimal string. */
      amount: string;
    }): Promise<`0x${string}`> => {
      const token = getToken(params.chainId, params.tokenSymbol);
      if (!token) throw new Error("Unsupported token");

      if (currentChainId !== params.chainId) {
        await switchChainAsync({ chainId: params.chainId as SupportedChainId });
      }

      const value = BigInt(params.amount);

      if (token.native) {
        return sendTransactionAsync({
          to: params.to as `0x${string}`,
          value,
          // Some mobile wallets require an explicit empty calldata field even
          // for a native CELO value transfer.
          data: "0x",
        });
      }

      if (!token.contract) throw new Error("Token has no contract on this network");

      return writeContractAsync({
        address: token.contract as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [params.to as `0x${string}`, value],
      });
    },
    [currentChainId, switchChainAsync, sendTransactionAsync, writeContractAsync],
  );
}
