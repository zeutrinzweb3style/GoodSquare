/**
 * Spending proposal lifecycle for Square Treasury.
 *
 * A spending proposal is an off-chain *record* of intent. Approving it does not
 * move any funds: an authorized treasury signer must still send the transaction
 * from their own wallet and submit the resulting hash, which is then verified
 * on-chain. The backend can never withdraw.
 *
 * The rules are pure so they can be unit tested without a database.
 */

export type SpendingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled";

const TRANSITIONS: Record<SpendingStatus, SpendingStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["executed", "cancelled"],
  rejected: [],
  executed: [],
  cancelled: [],
};

export function canTransition(
  from: SpendingStatus,
  to: SpendingStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: SpendingStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

export interface ExecutionContext {
  /** A treasury must be active to spend from it. */
  treasuryActive: boolean;
  /** Known balance in base units, or null when the balance is unknown. */
  balance: bigint | null;
  /** Requested amount in base units. */
  amount: bigint;
  /**
   * Whether a linked governance proposal passed. Null when no governance
   * proposal is linked, in which case it is not required.
   */
  governancePassed: boolean | null;
}

export interface ExecutionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Whether an approved spending proposal may be executed and recorded on-chain.
 * All conditions must hold; the caller additionally verifies the transaction
 * receipt before marking it executed.
 */
export function canExecute(
  status: SpendingStatus,
  context: ExecutionContext,
): ExecutionCheck {
  if (status !== "approved") {
    return { ok: false, reason: "Only approved spending proposals can be executed" };
  }
  if (!context.treasuryActive) {
    return { ok: false, reason: "Treasury is not active" };
  }
  if (context.governancePassed === false) {
    return {
      ok: false,
      reason: "The linked governance proposal has not passed",
    };
  }
  if (context.amount <= 0n) {
    return { ok: false, reason: "Amount must be greater than zero" };
  }
  if (context.balance != null && context.amount > context.balance) {
    return { ok: false, reason: "Amount exceeds the treasury balance" };
  }
  return { ok: true };
}
