import type { CommunityRole } from "@/lib/permissions";

export interface Profile {
  address: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  visibility: "public" | "private";
  creator_address: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  address: string;
  role: CommunityRole;
  joined_at: string;
}

export interface CommunityWithMembership extends Community {
  membership_role: CommunityRole | null;
}

export const QUEST_CATEGORIES = [
  "social",
  "participation",
  "education",
  "development",
  "events",
  "custom",
] as const;

export type QuestCategory = (typeof QUEST_CATEGORIES)[number];

export type QuestStatus = "draft" | "active" | "closed";

export interface Quest {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  category: QuestCategory;
  requirements: string | null;
  reward_info: string | null;
  status: QuestStatus;
  deadline: string | null;
  exp_reward: number;
  created_by: string;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface QuestSubmission {
  id: string;
  quest_id: string;
  community_id: string;
  address: string;
  proof_url: string | null;
  proof_text: string | null;
  status: SubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export type ReputationSourceType = "quest" | "badge" | "manual" | "adjustment";

export interface ReputationEvent {
  id: string;
  community_id: string;
  address: string;
  delta: number;
  reason: string;
  source_type: ReputationSourceType;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Badge {
  id: string;
  community_id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  created_by: string;
  created_at: string;
}

export interface UserBadge {
  id: string;
  badge_id: string;
  community_id: string;
  address: string;
  awarded_by: string | null;
  awarded_at: string;
}

export interface LeaderboardEntry {
  address: string;
  exp: number;
  event_count: number;
  last_event_at: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export type ProposalStatus = "draft" | "active" | "closed" | "cancelled";

export type VoteChoice = "for" | "against" | "abstain";

export interface Proposal {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  status: ProposalStatus;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
  voter_role: CommunityRole;
  quorum_percent: number;
  approval_threshold: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: string;
  proposal_id: string;
  community_id: string;
  address: string;
  choice: VoteChoice;
  weight: number;
  reason: string | null;
  created_at: string;
}

export interface ProposalResults {
  proposal_id: string;
  community_id: string;
  status: ProposalStatus;
  voter_role: CommunityRole;
  quorum_percent: number;
  approval_threshold: number;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
  total_votes: number;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
}

export interface Treasury {
  id: string;
  community_id: string;
  name: string;
  address: string | null;
  chain_id: number;
  is_active: boolean;
  approval_threshold: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SpendingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled";

export interface TreasurySpendingProposal {
  id: string;
  treasury_id: string;
  community_id: string;
  title: string;
  description: string | null;
  token_symbol: string;
  amount: string;
  recipient: string;
  status: SpendingStatus;
  proposal_id: string | null;
  proposed_by: string;
  decided_by: string | null;
  decided_at: string | null;
  executed_tx_hash: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TreasuryTxDirection = "in" | "out";
export type TreasuryTxSource = "spending" | "manual" | "reward";

export interface TreasuryTransaction {
  id: string;
  treasury_id: string;
  community_id: string;
  direction: TreasuryTxDirection;
  token_symbol: string;
  amount: string;
  from_address: string;
  to_address: string;
  chain_id: number;
  tx_hash: string;
  block_number: number | null;
  source: TreasuryTxSource;
  spending_proposal_id: string | null;
  recorded_by: string | null;
  occurred_at: string | null;
  created_at: string;
}

export type PaymentRequestStatus = "open" | "paid" | "cancelled";

export interface PaymentRequest {
  id: string;
  community_id: string | null;
  created_by: string;
  payee_address: string;
  chain_id: number;
  token_symbol: string;
  amount: string;
  memo: string | null;
  status: PaymentRequestStatus;
  paid_tx_hash: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "pending" | "verified" | "failed";

export interface Payment {
  id: string;
  community_id: string | null;
  payment_request_id: string | null;
  payer_address: string;
  payee_address: string;
  chain_id: number;
  token_symbol: string;
  amount: string;
  tx_hash: string;
  block_number: number | null;
  status: PaymentStatus;
  verified_at: string | null;
  created_at: string;
}

export interface TokenBalance {
  token_symbol: string;
  decimals: number;
  /** Base-unit balance as a decimal string, or null when it could not be read. */
  balance: string | null;
}

export interface TreasurySigner {
  id: string;
  treasury_id: string;
  address: string;
  added_by: string;
  created_at: string;
}

export interface TreasurySpendingApproval {
  id: string;
  proposal_id: string;
  approver: string;
  created_at: string;
}

export type RewardStatus = "draft" | "active" | "completed" | "cancelled";
export type RewardRecipientStatus = "pending" | "paid" | "skipped";

export interface RewardDistribution {
  id: string;
  treasury_id: string;
  community_id: string;
  title: string;
  description: string | null;
  token_symbol: string;
  status: RewardStatus;
  created_by: string;
  activated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardRecipient {
  id: string;
  distribution_id: string;
  address: string;
  /** Amount in base units, as a decimal string. */
  amount: string;
  status: RewardRecipientStatus;
  tx_hash: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  address: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  community_id: string | null;
  read_at: string | null;
  created_at: string;
}
