import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import { hasAtLeastRole, type CommunityRole } from "@/lib/permissions";
import {
  isVotingOpen,
  resolveVote,
  type VoteResult,
} from "@/lib/governance/results";
import type {
  Proposal,
  ProposalResults,
  ProposalStatus,
  Vote,
  VoteChoice,
} from "@/lib/types";

export async function getProposalById(id: string): Promise<Proposal | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listProposals(
  communityId: string,
  options: { status?: ProposalStatus; limit?: number } = {},
): Promise<Proposal[]> {
  const { status, limit = 50 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("proposals")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProposalResults(
  proposalId: string,
): Promise<ProposalResults | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("proposal_results")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getVote(
  proposalId: string,
  address: string,
): Promise<Vote | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listVotes(
  proposalId: string,
  options: { limit?: number } = {},
): Promise<Vote[]> {
  const { limit = 200 } = options;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/** Members whose role is at least `minimum` — the eligible voter population. */
export async function countEligibleVoters(
  communityId: string,
  minimum: CommunityRole,
): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId);

  if (error) throw error;
  return (data ?? []).filter((row) =>
    hasAtLeastRole(row.role as CommunityRole, minimum),
  ).length;
}

export function isEligibleVoter(
  role: CommunityRole | null,
  minimum: CommunityRole,
): boolean {
  if (minimum === "visitor") return true;
  return hasAtLeastRole(role, minimum);
}

export interface ProposalOutcome {
  results: ProposalResults;
  tally: VoteResult;
  eligible: number;
}

/** Resolve a proposal's tally against its quorum and approval rules. */
export async function computeProposalOutcome(
  proposal: Proposal,
): Promise<ProposalOutcome> {
  const results =
    (await getProposalResults(proposal.id)) ?? {
      proposal_id: proposal.id,
      community_id: proposal.community_id,
      status: proposal.status,
      voter_role: proposal.voter_role,
      quorum_percent: proposal.quorum_percent,
      approval_threshold: proposal.approval_threshold,
      voting_starts_at: proposal.voting_starts_at,
      voting_ends_at: proposal.voting_ends_at,
      total_votes: 0,
      votes_for: 0,
      votes_against: 0,
      votes_abstain: 0,
    };

  const eligible = await countEligibleVoters(
    proposal.community_id,
    proposal.voter_role,
  );

  const tally = resolveVote(
    {
      votes_for: results.votes_for,
      votes_against: results.votes_against,
      votes_abstain: results.votes_abstain,
    },
    {
      quorum_percent: proposal.quorum_percent,
      approval_threshold: proposal.approval_threshold,
    },
    eligible,
  );

  return { results, tally, eligible };
}

export async function createProposal(input: {
  communityId: string;
  title: string;
  description?: string | null;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
  voterRole: CommunityRole;
  quorumPercent: number;
  approvalThreshold: number;
  status: ProposalStatus;
  createdBy: string;
}): Promise<Proposal> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("proposals")
    .insert({
      community_id: input.communityId,
      title: input.title,
      description: input.description || null,
      voting_starts_at: input.votingStartsAt || null,
      voting_ends_at: input.votingEndsAt || null,
      voter_role: input.voterRole,
      quorum_percent: input.quorumPercent,
      approval_threshold: input.approvalThreshold,
      status: input.status,
      created_by: normalizeAddress(input.createdBy),
    })
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(input.createdBy),
    action: "proposal.create",
    entityType: "proposal",
    entityId: data.id,
    communityId: input.communityId,
    metadata: { title: input.title, status: input.status },
  });

  return data;
}

export async function updateProposalStatus(
  proposal: Proposal,
  status: ProposalStatus,
  actor: string,
): Promise<Proposal> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("proposals")
    .update({ status })
    .eq("id", proposal.id)
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "proposal.status",
    entityType: "proposal",
    entityId: proposal.id,
    communityId: proposal.community_id,
    metadata: { from: proposal.status, to: status },
  });

  return data;
}

export class VoteError extends Error {
  constructor(
    message: string,
    readonly code: "closed" | "duplicate" | "not-eligible",
  ) {
    super(message);
    this.name = "VoteError";
  }
}

export async function castVote(input: {
  proposal: Proposal;
  address: string;
  choice: VoteChoice;
  reason?: string | null;
}): Promise<Vote> {
  const { proposal } = input;

  if (!isVotingOpen(proposal)) {
    throw new VoteError("Voting is not open for this proposal", "closed");
  }

  const normalized = normalizeAddress(input.address);
  const existing = await getVote(proposal.id, normalized);
  if (existing) {
    throw new VoteError("You have already voted on this proposal", "duplicate");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("votes")
    .insert({
      proposal_id: proposal.id,
      community_id: proposal.community_id,
      address: normalized,
      choice: input.choice,
      weight: 1,
      reason: input.reason || null,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation: a concurrent request cast the same vote first.
    if (error.code === "23505") {
      throw new VoteError("You have already voted on this proposal", "duplicate");
    }
    throw error;
  }

  await writeAuditLog({
    actor: normalized,
    action: "vote.cast",
    entityType: "proposal",
    entityId: proposal.id,
    communityId: proposal.community_id,
    metadata: { choice: input.choice },
  });

  return data;
}
