/**
 * On-chain transfer verification.
 *
 * The backend never moves funds. It only *verifies* that a payment a user
 * claims to have made actually happened on Celo. These helpers are pure: they
 * compare an expected transfer against data decoded from a transaction receipt,
 * so the rules can be unit tested without a network. Fetching the receipt lives
 * in `./chain`; choosing the token contract lives in `./tokens`.
 *
 * Verification is deliberately strict. A payment is only accepted when every
 * field matches: token contract, sender, recipient, amount, and a successful
 * receipt. This prevents recording a payment that never settled, was sent to
 * the wrong address, or used a different (spoofed) token.
 */

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TransferExpectation {
  /** Payer wallet (the authenticated user). Lowercase. */
  from: string;
  /** Recipient: a treasury address or a payment-request payee. Lowercase. */
  to: string;
  /** Amount in base units. */
  amount: bigint;
}

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
}

export interface DecodedTransfer {
  contract: string;
  from: string;
  to: string;
  amount: bigint;
}

function topicToAddress(topic: string): string {
  // topics are 32-byte hex; an address is the low 20 bytes.
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

/** Decode an ERC-20 Transfer log, or null when the log is not one. */
export function decodeTransferLog(log: RawLog): DecodedTransfer | null {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  if (log.topics.length < 3) return null;
  return {
    contract: log.address.toLowerCase(),
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    amount: hexToBigInt(log.data),
  };
}

export interface ObservedTransfer {
  from: string;
  to: string;
  amount: bigint;
}

export interface VerificationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Confirm that an observed transfer satisfies an expectation. `from`/`to` are
 * compared case-insensitively because wallet addresses are stored lowercase.
 */
export function matchesTransfer(
  expectation: TransferExpectation,
  observed: ObservedTransfer,
): VerificationResult {
  if (observed.from.toLowerCase() !== expectation.from.toLowerCase()) {
    return { ok: false, reason: "Sender does not match the authenticated wallet" };
  }
  if (observed.to.toLowerCase() !== expectation.to.toLowerCase()) {
    return { ok: false, reason: "Recipient does not match the expected address" };
  }
  if (observed.amount !== expectation.amount) {
    return { ok: false, reason: "Amount does not match the payment record" };
  }
  return { ok: true };
}

/**
 * Find the transfer in a receipt's logs that satisfies the expectation for a
 * given ERC-20 contract. Returns the matching observation or null. The caller
 * passes the contract so this module stays free of token-registry lookups.
 */
export function findMatchingErc20Transfer(
  contract: string,
  expectation: TransferExpectation,
  logs: RawLog[],
): ObservedTransfer | null {
  const wanted = contract.toLowerCase();

  for (const log of logs) {
    const decoded = decodeTransferLog(log);
    if (!decoded) continue;
    if (decoded.contract !== wanted) continue;
    const result = matchesTransfer(expectation, decoded);
    if (result.ok) return decoded;
  }
  return null;
}
