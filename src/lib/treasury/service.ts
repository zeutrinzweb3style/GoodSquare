import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import {
  getErc20Balance,
  getNativeBalance,
} from "@/lib/treasury/chain";
import { payableTokens, getToken } from "@/lib/treasury/tokens";
import { canExecute, canTransition } from "@/lib/treasury/spending";
import { verifyTransfer } from "@/lib/treasury/verify";
import type {
  SpendingStatus,
  TokenBalance,
  Treasury,
  TreasurySpendingProposal,
  TreasuryTransaction,
} from "@/lib/types";

export async function getTreasuryByCommunity(
  communityId: string,
): Promise<Treasury | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasuries")
    .select("*")
    .eq("community_id", communityId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTreasuryById(id: string): Promise<Treasury | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasuries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createTreasury(input: {
  communityId: string;
  name: string;
  address?: string | null;
  chainId: number;
  isActive: boolean;
  createdBy: string;
}): Promise<Treasury> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasuries")
    .insert({
      community_id: input.communityId,
      name: input.name,
      address: input.address ? normalizeAddress(input.address) : null,
      chain_id: input.chainId,
      is_active: input.isActive,
      created_by: normalizeAddress(input.createdBy),
    })
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(input.createdBy),
    action: "treasury.create",
    entityType: "treasury",
    entityId: data.id,
    communityId: input.communityId,
    metadata: { name: input.name, chainId: input.chainId },
  });

  return data;
}

export async function updateTreasury(
  treasury: Treasury,
  patch: { name?: string; address?: string | null; isActive?: boolean },
  actor: string,
): Promise<Treasury> {
  const supabase = createServiceRoleClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.address !== undefined) {
    update.address = patch.address ? normalizeAddress(patch.address) : null;
  }
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .from("treasuries")
    .update(update)
    .eq("id", treasury.id)
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "treasury.update",
    entityType: "treasury",
    entityId: treasury.id,
    communityId: treasury.community_id,
    metadata: { fields: Object.keys(update) },
  });

  return data;
}

export async function listTreasuryTransactions(
  treasuryId: string,
  options: { limit?: number } = {},
): Promise<TreasuryTransaction[]> {
  const { limit = 100 } = options;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasury_transactions")
    .select("*")
    .eq("treasury_id", treasuryId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/** Live balances for every payable token on the treasury's chain. */
export async function getTreasuryBalances(
  treasury: Treasury,
): Promise<TokenBalance[]> {
  if (!treasury.address) return [];
  const tokens = payableTokens(treasury.chain_id);

  return Promise.all(
    tokens.map(async (token) => {
      const raw = token.native
        ? await getNativeBalance(treasury.chain_id, treasury.address!)
        : await getErc20Balance(
            treasury.chain_id,
            token.symbol,
            treasury.address!,
          );
      return {
        token_symbol: token.symbol,
        decimals: token.decimals,
        balance: raw == null ? null : raw.toString(),
      } satisfies TokenBalance;
    }),
  );
}

export async function listSpendingProposals(
  communityId: string,
  options: { status?: SpendingStatus; limit?: number } = {},
): Promise<TreasurySpendingProposal[]> {
  const { status, limit = 50 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("treasury_spending_proposals")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSpendingProposalById(
  id: string,
): Promise<TreasurySpendingProposal | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasury_spending_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createSpendingProposal(input: {
  treasury: Treasury;
  title: string;
  description?: string | null;
  tokenSymbol: string;
  /** Amount in base units as a decimal string. */
  amount: string;
  recipient: string;
  proposalId?: string | null;
  proposedBy: string;
}): Promise<TreasurySpendingProposal> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasury_spending_proposals")
    .insert({
      treasury_id: input.treasury.id,
      community_id: input.treasury.community_id,
      title: input.title,
      description: input.description || null,
      token_symbol: input.tokenSymbol,
      amount: input.amount,
      recipient: normalizeAddress(input.recipient),
      proposal_id: input.proposalId || null,
      proposed_by: normalizeAddress(input.proposedBy),
    })
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(input.proposedBy),
    action: "treasury.spending.create",
    entityType: "treasury_spending_proposal",
    entityId: data.id,
    communityId: input.treasury.community_id,
    metadata: {
      token: input.tokenSymbol,
      amount: input.amount,
      recipient: input.recipient,
    },
  });

  return data;
}

export class SpendingError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid" | "not-found",
  ) {
    super(message);
    this.name = "SpendingError";
  }
}

/** Approve, reject, or cancel a spending proposal. None of these move funds. */
export async function reviewSpendingProposal(
  proposal: TreasurySpendingProposal,
  decision: "approved" | "rejected" | "cancelled",
  actor: string,
): Promise<TreasurySpendingProposal> {
  if (!canTransition(proposal.status, decision)) {
    throw new SpendingError(
      `Cannot change a ${proposal.status} proposal to ${decision}`,
      "conflict",
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasury_spending_proposals")
    .update({
      status: decision,
      decided_by: normalizeAddress(actor),
      decided_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("status", proposal.status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new SpendingError("Proposal was already decided", "conflict");
  }

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "treasury.spending.review",
    entityType: "treasury_spending_proposal",
    entityId: proposal.id,
    communityId: proposal.community_id,
    metadata: { decision },
  });

  return data;
}

/**
 * Record an executed spend. The signer already sent the transaction from their
 * own wallet; here we verify the receipt matches the approved terms, mark the
 * proposal executed, and append the treasury transaction.
 */
export async function executeSpendingProposal(
  proposal: TreasurySpendingProposal,
  treasury: Treasury,
  txHash: string,
  actor: string,
): Promise<TreasurySpendingProposal> {
  const token = getToken(treasury.chain_id, proposal.token_symbol);
  if (!token) {
    throw new SpendingError("Unsupported token", "invalid");
  }

  const balanceRaw = treasury.address
    ? token.native
      ? await getNativeBalance(treasury.chain_id, treasury.address)
      : await getErc20Balance(treasury.chain_id, token.symbol, treasury.address)
    : null;

  const check = canExecute(proposal.status, {
    treasuryActive: treasury.is_active,
    balance: balanceRaw,
    amount: BigInt(proposal.amount),
    governancePassed: null,
  });
  if (!check.ok) {
    throw new SpendingError(check.reason ?? "Cannot execute", "invalid");
  }

  const verified = await verifyTransfer({
    chainId: treasury.chain_id,
    tokenSymbol: proposal.token_symbol,
    from: normalizeAddress(treasury.address ?? ""),
    to: normalizeAddress(proposal.recipient),
    amount: BigInt(proposal.amount),
    txHash,
  });
  if (!verified.ok) {
    throw new SpendingError(
      verified.reason ?? "Transaction could not be verified",
      "invalid",
    );
  }

  const supabase = createServiceRoleClient();
  const { error: txError } = await supabase
    .from("treasury_transactions")
    .insert({
      treasury_id: treasury.id,
      community_id: treasury.community_id,
      direction: "out",
      token_symbol: proposal.token_symbol,
      amount: proposal.amount,
      from_address: normalizeAddress(treasury.address ?? ""),
      to_address: normalizeAddress(proposal.recipient),
      chain_id: treasury.chain_id,
      tx_hash: normalizeAddress(txHash),
      block_number: verified.blockNumber ? Number(verified.blockNumber) : null,
      source: "spending",
      spending_proposal_id: proposal.id,
      recorded_by: normalizeAddress(actor),
      occurred_at: new Date().toISOString(),
    });

  // 23505: this transfer is already recorded.
  if (txError && txError.code !== "23505") throw txError;

  const { data, error } = await supabase
    .from("treasury_spending_proposals")
    .update({
      status: "executed",
      executed_tx_hash: normalizeAddress(txHash),
      executed_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new SpendingError("Proposal is no longer approved", "conflict");
  }

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "treasury.spending.execute",
    entityType: "treasury_spending_proposal",
    entityId: proposal.id,
    communityId: proposal.community_id,
    metadata: { txHash, token: proposal.token_symbol, amount: proposal.amount },
  });

  return data;
}

/** Record a plain transfer in or out of the treasury, after on-chain checks. */
export async function recordTreasuryTransaction(input: {
  treasury: Treasury;
  tokenSymbol: string;
  /** Amount in base units. */
  amount: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  actor: string;
}): Promise<TreasuryTransaction> {
  const treasuryAddress = normalizeAddress(input.treasury.address ?? "");
  const from = normalizeAddress(input.fromAddress);
  const to = normalizeAddress(input.toAddress);

  const direction: "in" | "out" | null =
    to === treasuryAddress ? "in" : from === treasuryAddress ? "out" : null;
  if (!direction) {
    throw new SpendingError(
      "One side of the transfer must be the treasury address",
      "invalid",
    );
  }

  const verified = await verifyTransfer({
    chainId: input.treasury.chain_id,
    tokenSymbol: input.tokenSymbol,
    from,
    to,
    amount: BigInt(input.amount),
    txHash: input.txHash,
  });
  if (!verified.ok) {
    throw new SpendingError(
      verified.reason ?? "Transaction could not be verified",
      "invalid",
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("treasury_transactions")
    .insert({
      treasury_id: input.treasury.id,
      community_id: input.treasury.community_id,
      direction,
      token_symbol: input.tokenSymbol,
      amount: input.amount,
      from_address: from,
      to_address: to,
      chain_id: input.treasury.chain_id,
      tx_hash: normalizeAddress(input.txHash),
      block_number: verified.blockNumber ? Number(verified.blockNumber) : null,
      source: "manual",
      recorded_by: normalizeAddress(input.actor),
      occurred_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new SpendingError("This transfer is already recorded", "conflict");
    }
    throw error;
  }

  await writeAuditLog({
    actor: normalizeAddress(input.actor),
    action: "treasury.transaction.record",
    entityType: "treasury_transaction",
    entityId: data.id,
    communityId: input.treasury.community_id,
    metadata: {
      direction,
      token: input.tokenSymbol,
      amount: input.amount,
      txHash: input.txHash,
    },
  });

  return data;
}
