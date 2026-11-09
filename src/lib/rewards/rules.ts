/**
 * Community reward distribution.
 *
 * A reward distribution pays a list of recipients from a community treasury in
 * a single token. It is non-custodial like everything else here: Good Square
 * only records the plan and verifies each on-chain transfer a treasury signer
 * makes. The backend never sends funds.
 *
 * Amounts are base-unit integers (as strings on the wire). The rules are pure
 * so they can be unit tested without a database.
 */

export type RewardStatus = "draft" | "active" | "completed" | "cancelled";
export type RewardRecipientStatus = "pending" | "paid" | "skipped";

const TRANSITIONS: Record<RewardStatus, RewardStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionReward(
  from: RewardStatus,
  to: RewardStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isRewardTerminal(status: RewardStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

export interface RewardRecipientInput {
  address: string;
  /** Amount in base units. */
  amount: bigint;
}

export function normalizeRewardAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Reject a recipient list that repeats an address: a distribution must never
 * pay the same wallet twice, which would make the totals and the audit trail
 * ambiguous.
 */
export function duplicateRecipients(
  recipients: RewardRecipientInput[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const recipient of recipients) {
    const address = normalizeRewardAddress(recipient.address);
    if (seen.has(address)) duplicates.add(address);
    seen.add(address);
  }
  return [...duplicates];
}

/** Sum of all recipient amounts, in base units. */
export function totalRewardAmount(
  recipients: RewardRecipientInput[],
): bigint {
  return recipients.reduce((sum, recipient) => sum + recipient.amount, 0n);
}

export interface DistributionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Whether a distribution may be activated and its transfers recorded. All
 * conditions must hold; the caller additionally verifies each transfer receipt.
 */
export function canDistribute(input: {
  status: RewardStatus;
  treasuryActive: boolean;
  /** Known treasury balance in base units, or null when unknown. */
  balance: bigint | null;
  recipients: RewardRecipientInput[];
}): DistributionCheck {
  const { status, treasuryActive, balance, recipients } = input;

  if (status !== "active" && status !== "draft") {
    return { ok: false, reason: `Cannot distribute a ${status} distribution` };
  }
  if (!treasuryActive) {
    return { ok: false, reason: "Treasury is not active" };
  }
  if (recipients.length === 0) {
    return { ok: false, reason: "Add at least one recipient" };
  }
  if (recipients.some((recipient) => recipient.amount <= 0n)) {
    return { ok: false, reason: "Every amount must be greater than zero" };
  }
  const duplicates = duplicateRecipients(recipients);
  if (duplicates.length > 0) {
    return { ok: false, reason: "A recipient is listed more than once" };
  }
  const total = totalRewardAmount(recipients);
  if (balance != null && total > balance) {
    return { ok: false, reason: "The total exceeds the treasury balance" };
  }
  return { ok: true };
}

/** Whether an individual recipient payout may be recorded. */
export function canPayRecipient(input: {
  distributionStatus: RewardStatus;
  recipientStatus: RewardRecipientStatus;
}): DistributionCheck {
  const { distributionStatus, recipientStatus } = input;
  if (distributionStatus !== "active") {
    return { ok: false, reason: "The distribution is not active" };
  }
  if (recipientStatus === "paid") {
    return { ok: false, reason: "This recipient is already paid" };
  }
  if (recipientStatus === "skipped") {
    return { ok: false, reason: "This recipient was skipped" };
  }
  return { ok: true };
}

/** Whether every recipient has been paid or skipped. */
export function isDistributionComplete(
  recipients: { status: RewardRecipientStatus }[],
): boolean {
  return (
    recipients.length > 0 &&
    recipients.every((recipient) => recipient.status !== "pending")
  );
}

export interface DistributionProgress {
  paid: number;
  total: number;
  /** Total still pending, in base units. */
  outstanding: bigint;
}

export function distributionProgress(
  recipients: { status: RewardRecipientStatus; amount: bigint }[],
): DistributionProgress {
  let paid = 0;
  let outstanding = 0n;
  for (const recipient of recipients) {
    if (recipient.status === "paid") {
      paid += 1;
    } else if (recipient.status === "pending") {
      outstanding += recipient.amount;
    }
  }
  return { paid, total: recipients.length, outstanding };
}
