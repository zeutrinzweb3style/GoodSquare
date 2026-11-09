/**
 * Multisig-style treasury approvals.
 *
 * A treasury may name a set of signers and an approval threshold. When it does,
 * a spending proposal is only approved once at least `threshold` distinct
 * signers have approved it. Good Square still cannot move funds: reaching the
 * threshold only flips the proposal to `approved`, after which a signer must
 * still send the transaction from the treasury wallet and submit the hash.
 *
 * The rules are pure so they can be unit tested without a database.
 */

export interface ApprovalRecord {
  /** Signer wallet, lowercase. */
  approver: string;
}

export interface SignerSet {
  /** Signer wallets, lowercase. */
  signers: string[];
  /** How many distinct signers must approve. */
  threshold: number;
}

export function normalizeSigner(address: string): string {
  return address.trim().toLowerCase();
}

export function isSigner(signers: string[], address: string): boolean {
  const wanted = normalizeSigner(address);
  return signers.some((signer) => normalizeSigner(signer) === wanted);
}

/**
 * The effective threshold for a signer set: at least 1 and never more than the
 * number of signers. A treasury with no signers has a threshold of 1 (the
 * owner/admin flow decides, not the signer list).
 */
export function effectiveThreshold(
  signerCount: number,
  threshold: number,
): number {
  if (signerCount <= 0) return 1;
  return Math.min(Math.max(1, Math.floor(threshold)), signerCount);
}

/** Distinct approver wallets, normalized, in first-seen order. */
export function distinctApprovers(approvals: ApprovalRecord[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const approval of approvals) {
    const address = normalizeSigner(approval.approver);
    if (seen.has(address)) continue;
    seen.add(address);
    result.push(address);
  }
  return result;
}

/** How many distinct *signers* have approved (non-signers never count). */
export function approvalCount(
  approvals: ApprovalRecord[],
  signers: string[],
): number {
  return distinctApprovers(approvals).filter((address) =>
    isSigner(signers, address),
  ).length;
}

export interface ApprovalCheck {
  ok: boolean;
  reason?: string;
}

/** Whether a wallet may approve a pending proposal. */
export function canApprove(input: {
  proposalStatus: string;
  signers: string[];
  approvals: ApprovalRecord[];
  approver: string;
}): ApprovalCheck {
  const { proposalStatus, signers, approvals, approver } = input;
  if (proposalStatus !== "pending") {
    return { ok: false, reason: "Only pending proposals can be approved" };
  }
  if (!isSigner(signers, approver)) {
    return { ok: false, reason: "Only treasury signers can approve" };
  }
  if (distinctApprovers(approvals).includes(normalizeSigner(approver))) {
    return { ok: false, reason: "You have already approved this proposal" };
  }
  return { ok: true };
}

/** Whether a wallet may withdraw an approval it previously gave. */
export function canRevokeApproval(input: {
  proposalStatus: string;
  approvals: ApprovalRecord[];
  approver: string;
}): ApprovalCheck {
  const { proposalStatus, approvals, approver } = input;
  if (proposalStatus !== "pending") {
    return { ok: false, reason: "Only pending proposals can be changed" };
  }
  if (!distinctApprovers(approvals).includes(normalizeSigner(approver))) {
    return { ok: false, reason: "You have not approved this proposal" };
  }
  return { ok: true };
}

/**
 * Whether the signer set has reached its threshold, and therefore the proposal
 * should become `approved`.
 */
export function thresholdReached(input: {
  signers: string[];
  approvals: ApprovalRecord[];
  threshold: number;
}): boolean {
  const { signers, approvals, threshold } = input;
  const required = effectiveThreshold(signers.length, threshold);
  return approvalCount(approvals, signers) >= required;
}

export interface Progress {
  approved: number;
  required: number;
}

/** Human-facing progress, e.g. 2 of 3 signers approved. */
export function approvalProgress(input: {
  signers: string[];
  approvals: ApprovalRecord[];
  threshold: number;
}): Progress {
  const { signers, approvals, threshold } = input;
  return {
    approved: approvalCount(approvals, signers),
    required: effectiveThreshold(signers.length, threshold),
  };
}
