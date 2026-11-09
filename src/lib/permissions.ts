export const COMMUNITY_ROLES = [
  "owner",
  "admin",
  "moderator",
  "contributor",
  "member",
  "visitor",
] as const;

export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

/**
 * Ordered from most to least privileged. A higher rank implies every
 * permission of the roles below it.
 */
export const ROLE_RANK: Record<CommunityRole, number> = {
  owner: 5,
  admin: 4,
  moderator: 3,
  contributor: 2,
  member: 1,
  visitor: 0,
};

export const PERMISSIONS = [
  "community:update",
  "community:delete",
  "member:manage",
  "quest:create",
  "quest:moderate",
  "reputation:award",
  "treasury:manage",
  "proposal:create",
  "proposal:manage",
  "vote:cast",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<CommunityRole, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [
    "community:update",
    "member:manage",
    "quest:create",
    "quest:moderate",
    "reputation:award",
    "proposal:create",
    "proposal:manage",
    "vote:cast",
  ],
  moderator: [
    "quest:moderate",
    "proposal:create",
    "proposal:manage",
    "vote:cast",
  ],
  contributor: ["proposal:create", "vote:cast"],
  member: ["vote:cast"],
  visitor: [],
};

export function roleHasPermission(
  role: CommunityRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAtLeastRole(
  role: CommunityRole | null | undefined,
  minimum: CommunityRole,
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
