import { z } from "zod";

const walletAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM wallet address");

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters")
  .max(48, "Slug must be at most 48 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens",
  );

export const requestNonceSchema = z.object({
  address: walletAddress,
});

export const verifyLoginSchema = z.object({
  address: walletAddress,
  message: z.string().min(1).max(2000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature format"),
});

export const updateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Use letters, numbers, underscores, and hyphens only",
    ),
  displayName: z.string().trim().max(64).optional().or(z.literal("")),
  bio: z.string().trim().max(280).optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .max(500)
    .optional()
    .or(z.literal("")),
});

export const createCommunitySchema = z.object({
  name: z.string().trim().min(3).max(64),
  slug,
  description: z.string().trim().max(500).optional().or(z.literal("")),
  visibility: z.enum(["public", "private"]).default("public"),
});

export const listCommunitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const questCategory = z.enum([
  "social",
  "participation",
  "education",
  "development",
  "events",
  "custom",
]);

export const createQuestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  category: questCategory.default("custom"),
  requirements: z.string().trim().max(1000).optional().or(z.literal("")),
  rewardInfo: z.string().trim().max(500).optional().or(z.literal("")),
  expReward: z.coerce.number().int().min(0).max(100000).default(0),
  deadline: z
    .string()
    .trim()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("")),
  status: z.enum(["draft", "active", "closed"]).default("active"),
});

export const updateQuestSchema = createQuestSchema.partial();

export const submitQuestProofSchema = z
  .object({
    proofUrl: z
      .string()
      .trim()
      .url("Enter a valid URL")
      .max(500)
      .optional()
      .or(z.literal("")),
    proofText: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => Boolean(v.proofUrl) || Boolean(v.proofText), {
    message: "Provide a proof URL or a written proof",
    path: ["proofText"],
  });

export const reviewSubmissionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const awardReputationSchema = z.object({
  address: walletAddress,
  delta: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "Delta must be non-zero")
    .refine((n) => n >= -100000 && n <= 100000, "Delta is out of range"),
  reason: z.string().trim().min(3).max(200),
});

export const createBadgeSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  icon: z.string().trim().max(200).optional().or(z.literal("")),
});

export const awardBadgeSchema = z.object({
  address: walletAddress,
});

export const leaderboardQuerySchema = z.object({
  period: z.enum(["all", "week", "month"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type CreateQuestInput = z.infer<typeof createQuestSchema>;
export type UpdateQuestInput = z.infer<typeof updateQuestSchema>;
export type SubmitQuestProofInput = z.infer<typeof submitQuestProofSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
export type AwardReputationInput = z.infer<typeof awardReputationSchema>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
