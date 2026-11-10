/**
 * Shared types for the Good Square SDK. Field names mirror the REST API's
 * snake_case JSON so responses can be passed through unchanged.
 */

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
  role: "owner" | "admin" | "moderator" | "contributor" | "member" | "visitor";
  joined_at: string;
}

export interface Quest {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  status: string;
  exp_reward: number;
  reward_token_symbol: string | null;
  /** Human decimal reward per approved submission, in reward_token_symbol units. */
  reward_amount: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestSubmission {
  id: string;
  quest_id: string;
  community_id: string;
  address: string;
  status: "pending" | "approved" | "rejected";
  proof_url: string | null;
  proof_text: string | null;
  review_note: string | null;
  reward_recipient_id: string | null;
  created_at: string;
}

export interface ReputationSummary {
  address: string;
  community_id: string | null;
  exp: number;
  level: number;
  level_name: string;
  updated_at: string | null;
}

export interface Proposal {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "closed" | "cancelled";
  created_by: string;
  created_at: string;
  closes_at: string | null;
}

export interface Treasury {
  id: string;
  community_id: string;
  address: string | null;
  chain_id: number;
  approval_threshold: number;
  created_at: string;
}

export interface Payment {
  id: string;
  community_id: string | null;
  payer_address: string;
  payee_address: string;
  token_symbol: string;
  amount: string;
  tx_hash: string;
  created_at: string;
}

export interface Profile {
  address: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** A page of results. `total` is present on list endpoints that count. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  community_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  response_status: number | null;
  error: string | null;
  created_at: string;
}
