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
