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
