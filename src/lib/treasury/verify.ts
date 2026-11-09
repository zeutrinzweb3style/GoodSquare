import { getReceipt, getTransaction } from "./chain";
import {
  findMatchingErc20Transfer,
  matchesTransfer,
  type TransferExpectation,
} from "./verification";
import { isNativeToken, getToken } from "./tokens";

/**
 * Verify that a claimed transfer actually settled on-chain exactly as recorded.
 * This is the single gate that stands between a user-submitted hash and a
 * trusted database row. It reads only; it never sends.
 */

export interface VerifyInput {
  chainId: number;
  tokenSymbol: string;
  /** Lowercase payer address. */
  from: string;
  /** Lowercase recipient address. */
  to: string;
  /** Amount in base units. */
  amount: bigint;
  txHash: string;
}

export interface VerifyOutcome {
  ok: boolean;
  reason?: string;
  blockNumber?: bigint | null;
}

export async function verifyTransfer(input: VerifyInput): Promise<VerifyOutcome> {
  const expectation: TransferExpectation = {
    from: input.from,
    to: input.to,
    amount: input.amount,
  };

  const receipt = await getReceipt(input.chainId, input.txHash);
  if (!receipt) {
    return { ok: false, reason: "Transaction not found on the selected network" };
  }
  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction did not succeed" };
  }

  if (isNativeToken(input.chainId, input.tokenSymbol)) {
    const tx = await getTransaction(input.chainId, input.txHash);
    if (!tx || !tx.to) {
      return { ok: false, reason: "Could not read the native transfer" };
    }
    const result = matchesTransfer(expectation, {
      from: tx.from,
      to: tx.to,
      amount: tx.value,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, blockNumber: receipt.blockNumber };
  }

  const token = getToken(input.chainId, input.tokenSymbol);
  if (!token?.contract) {
    return { ok: false, reason: "Unknown token for the selected network" };
  }

  const observed = findMatchingErc20Transfer(
    token.contract,
    expectation,
    receipt.logs,
  );
  if (!observed) {
    return {
      ok: false,
      reason: "No matching token transfer was found in the transaction",
    };
  }
  return { ok: true, blockNumber: receipt.blockNumber };
}
