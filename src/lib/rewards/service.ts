import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import { getToken } from "@/lib/treasury/tokens";
import { getErc20Balance, getNativeBalance } from "@/lib/treasury/chain";
import { verifyTransfer } from "@/lib/treasury/verify";
import { notify } from "@/lib/notifications/service";
import {
  canDistribute,
  canPayRecipient,
  canTransitionReward,
  distributionProgress,
  isDistributionComplete,
  normalizeRewardAddress,
  type RewardRecipientInput,
  type RewardStatus,
} from "@/lib/rewards/rules";
import type {
  RewardDistribution,
  RewardRecipient,
  Treasury,
} from "@/lib/types";

export class RewardError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid" | "not-found",
  ) {
    super(message);
    this.name = "RewardError";
  }
}

export async function listRewardDistributions(
  communityId: string,
  options: { limit?: number } = {},
): Promise<RewardDistribution[]> {
  const { limit = 50 } = options;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reward_distributions")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getRewardDistributionById(
  id: string,
): Promise<RewardDistribution | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reward_distributions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listRewardRecipients(
  distributionId: string,
): Promise<RewardRecipient[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reward_recipients")
    .select("*")
    .eq("distribution_id", distributionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getRewardRecipientById(
  id: string,
): Promise<RewardRecipient | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reward_recipients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createRewardDistribution(input: {
  treasury: Treasury;
  title: string;
  description?: string | null;
  tokenSymbol: string;
  /** Amounts in base units as decimal strings. */
  recipients: { address: string; amount: string }[];
  createdBy: string;
}): Promise<RewardDistribution> {
  const recipients: RewardRecipientInput[] = input.recipients.map((r) => ({
    address: normalizeRewardAddress(r.address),
    amount: BigInt(r.amount),
  }));

  const balanceRaw = input.treasury.address
    ? await readBalance(input.treasury, input.tokenSymbol)
    : null;

  const check = canDistribute({
    status: "draft",
    treasuryActive: input.treasury.is_active,
    balance: balanceRaw,
    recipients,
  });
  if (!check.ok) {
    throw new RewardError(check.reason ?? "Cannot create distribution", "invalid");
  }

  const supabase = createServiceRoleClient();
  const { data: distribution, error } = await supabase
    .from("reward_distributions")
    .insert({
      treasury_id: input.treasury.id,
      community_id: input.treasury.community_id,
      title: input.title,
      description: input.description || null,
      token_symbol: input.tokenSymbol,
      created_by: normalizeAddress(input.createdBy),
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: recipientsError } = await supabase
    .from("reward_recipients")
    .insert(
      recipients.map((recipient) => ({
        distribution_id: distribution.id,
        address: recipient.address,
        amount: recipient.amount.toString(),
      })),
    );
  if (recipientsError) throw recipientsError;

  await writeAuditLog({
    actor: normalizeAddress(input.createdBy),
    action: "reward.distribution.create",
    entityType: "reward_distribution",
    entityId: distribution.id,
    communityId: input.treasury.community_id,
    metadata: {
      token: input.tokenSymbol,
      recipients: recipients.length,
    },
  });

  return distribution;
}

/** Move a distribution through its lifecycle. No funds move here. */
export async function updateRewardDistribution(
  distribution: RewardDistribution,
  status: RewardStatus,
  actor: string,
): Promise<RewardDistribution> {
  if (!canTransitionReward(distribution.status, status)) {
    throw new RewardError(
      `Cannot change a ${distribution.status} distribution to ${status}`,
      "conflict",
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "active") patch.activated_at = now;
  if (status === "completed") patch.completed_at = now;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reward_distributions")
    .update(patch)
    .eq("id", distribution.id)
    .eq("status", distribution.status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new RewardError("Distribution was already updated", "conflict");
  }

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "reward.distribution.update",
    entityType: "reward_distribution",
    entityId: distribution.id,
    communityId: distribution.community_id,
    metadata: { status },
  });

  return data;
}

/**
 * Record a single reward payout. A treasury signer already sent the transfer
 * from the treasury wallet; here we verify the receipt matches the recipient's
 * amount, mark them paid, and auto-complete the distribution when everyone is
 * paid or skipped. The backend never sends funds.
 */
export async function payRewardRecipient(input: {
  distribution: RewardDistribution;
  treasury: Treasury;
  recipient: RewardRecipient;
  txHash: string;
  actor: string;
}): Promise<RewardRecipient> {
  const { distribution, treasury, recipient, txHash, actor } = input;

  const payCheck = canPayRecipient({
    distributionStatus: distribution.status,
    recipientStatus: recipient.status,
  });
  if (!payCheck.ok) {
    throw new RewardError(payCheck.reason ?? "Cannot pay recipient", "invalid");
  }

  const token = getToken(treasury.chain_id, distribution.token_symbol);
  if (!token) throw new RewardError("Unsupported token", "invalid");

  const from = normalizeAddress(treasury.address ?? "");
  const verified = await verifyTransfer({
    chainId: treasury.chain_id,
    tokenSymbol: distribution.token_symbol,
    from,
    to: normalizeAddress(recipient.address),
    amount: BigInt(recipient.amount),
    txHash,
  });
  if (!verified.ok) {
    throw new RewardError(
      verified.reason ?? "Transaction could not be verified",
      "invalid",
    );
  }

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const { error: txError } = await supabase
    .from("treasury_transactions")
    .insert({
      treasury_id: treasury.id,
      community_id: treasury.community_id,
      direction: "out",
      token_symbol: distribution.token_symbol,
      amount: recipient.amount,
      from_address: from,
      to_address: normalizeAddress(recipient.address),
      chain_id: treasury.chain_id,
      tx_hash: normalizeAddress(txHash),
      block_number: verified.blockNumber ? Number(verified.blockNumber) : null,
      source: "reward",
      reward_recipient_id: recipient.id,
      recorded_by: normalizeAddress(actor),
      occurred_at: now,
    });
  if (txError && txError.code !== "23505") throw txError;

  const { data, error } = await supabase
    .from("reward_recipients")
    .update({
      status: "paid",
      tx_hash: normalizeAddress(txHash),
      paid_at: now,
      recorded_by: normalizeAddress(actor),
    })
    .eq("id", recipient.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new RewardError("Recipient was already paid", "conflict");
  }

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "reward.recipient.pay",
    entityType: "reward_recipient",
    entityId: recipient.id,
    communityId: distribution.community_id,
    metadata: {
      distributionId: distribution.id,
      amount: recipient.amount,
      token: distribution.token_symbol,
      txHash,
    },
  });

  await notify({
    address: recipient.address,
    type: "reward.paid",
    title: "Reward received",
    body: `${distribution.title}: you were paid ${distribution.token_symbol}.`,
    entityType: "reward_distribution",
    entityId: distribution.id,
    communityId: distribution.community_id,
  });

  const recipients = await listRewardRecipients(distribution.id);
  if (isDistributionComplete(recipients)) {
    await updateRewardDistribution(distribution, "completed", actor);
  }

  return data;
}

export async function getDistributionProgress(distributionId: string) {
  const recipients = await listRewardRecipients(distributionId);
  return distributionProgress(
    recipients.map((recipient) => ({
      status: recipient.status,
      amount: BigInt(recipient.amount),
    })),
  );
}

async function readBalance(
  treasury: Treasury,
  tokenSymbol: string,
): Promise<bigint | null> {
  if (!treasury.address) return null;
  const token = getToken(treasury.chain_id, tokenSymbol);
  if (!token) return null;
  return token.native
    ? getNativeBalance(treasury.chain_id, treasury.address)
    : getErc20Balance(treasury.chain_id, token.symbol, treasury.address);
}
