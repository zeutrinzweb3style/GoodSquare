/**
 * Square Governance — pure voting rules.
 *
 * The MVP is one-wallet-one-vote: every vote weighs 1 and duplicates are
 * prevented by a unique constraint. These helpers compute whether voting is
 * open and how a tally resolves against a quorum and approval threshold. They
 * contain no I/O so they can be unit tested directly.
 */

export type VoteChoice = "for" | "against" | "abstain";
export type ProposalStatus = "draft" | "active" | "closed" | "cancelled";

export interface ProposalWindow {
  status: ProposalStatus;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
}

export interface ProposalTally {
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
}

export interface ProposalRules {
  quorum_percent: number;
  approval_threshold: number;
}

export type VotingPhase = "not-started" | "open" | "ended";

/** Where a proposal sits in its voting window, at a given moment. */
export function votingPhase(
  proposal: ProposalWindow,
  now: number = Date.now(),
): VotingPhase {
  if (proposal.status === "cancelled") return "ended";
  const start = proposal.voting_starts_at
    ? Date.parse(proposal.voting_starts_at)
    : null;
  const end = proposal.voting_ends_at
    ? Date.parse(proposal.voting_ends_at)
    : null;

  if (start !== null && now < start) return "not-started";
  if (end !== null && now >= end) return "ended";
  return "open";
}

export function isVotingOpen(
  proposal: ProposalWindow,
  now: number = Date.now(),
): boolean {
  return proposal.status === "active" && votingPhase(proposal, now) === "open";
}

export interface VoteResult extends ProposalTally {
  /** Total votes cast, including abstentions. */
  total_votes: number;
  /** Weight counted toward quorum and approval (excludes abstentions). */
  decisive_votes: number;
  /** Share of cast votes that approved, 0..1. Null when no decisive votes. */
  approval_share: number | null;
  /** Share of eligible members who voted, 0..1. Null when eligibility is 0. */
  participation_share: number | null;
  quorum_met: boolean;
  approval_met: boolean;
  /** Whether the proposal passes once both conditions are considered. */
  passed: boolean;
}

/**
 * Resolve a tally against the rules.
 *
 * Quorum counts every cast vote (including abstentions, which express
 * participation). Approval is measured over decisive votes only, so an
 * abstention never counts for or against a proposal.
 */
export function resolveVote(
  tally: ProposalTally,
  rules: ProposalRules,
  eligibleCount: number,
): VoteResult {
  const total =
    tally.votes_for + tally.votes_against + tally.votes_abstain;
  const decisive = tally.votes_for + tally.votes_against;

  const approvalShare = decisive > 0 ? tally.votes_for / decisive : null;
  const participationShare =
    eligibleCount > 0 ? total / eligibleCount : null;

  const quorumMet =
    rules.quorum_percent <= 0 ||
    (participationShare !== null &&
      participationShare * 100 >= rules.quorum_percent);

  const approvalMet =
    approvalShare !== null &&
    approvalShare * 100 >= rules.approval_threshold;

  return {
    ...tally,
    total_votes: total,
    decisive_votes: decisive,
    approval_share: approvalShare,
    participation_share: participationShare,
    quorum_met: quorumMet,
    approval_met: approvalMet,
    passed: quorumMet && approvalMet,
  };
}
