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
  verifiedOnly: z.boolean().default(false),
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
  verifiedOnly: z.boolean().default(false),
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

const roleEnum = z.enum([
  "owner",
  "admin",
  "moderator",
  "contributor",
  "member",
  "visitor",
]);

export const createProposalSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(5000).optional().or(z.literal("")),
    votingStartsAt: z
      .string()
      .trim()
      .datetime({ offset: true })
      .optional()
      .or(z.literal("")),
    votingEndsAt: z
      .string()
      .trim()
      .datetime({ offset: true })
      .optional()
      .or(z.literal("")),
    voterRole: roleEnum.default("member"),
    quorumPercent: z.coerce.number().int().min(0).max(100).default(0),
    approvalThreshold: z.coerce.number().int().min(0).max(100).default(50),
    status: z.enum(["draft", "active"]).default("active"),
  })
  .refine(
    (v) =>
      !v.votingStartsAt ||
      !v.votingEndsAt ||
      Date.parse(v.votingEndsAt) > Date.parse(v.votingStartsAt),
    { message: "Voting must end after it starts", path: ["votingEndsAt"] },
  );

export const castVoteSchema = z.object({
  choice: z.enum(["for", "against", "abstain"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updateProposalStatusSchema = z.object({
  status: z.enum(["draft", "active", "closed", "cancelled"]),
});

const tokenSymbol = z.enum(["CELO", "cUSD", "USDC", "USDT", "G$"]);

/** Human decimal amount. Stored/validated as a string, never a float. */
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Enter a positive decimal amount")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero");

const txHash = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Enter a valid transaction hash");

export const createTreasurySchema = z.object({
  name: z.string().trim().min(1).max(80).default("Community Treasury"),
  address: walletAddress.optional().or(z.literal("")),
  chainId: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export const updateTreasurySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  address: walletAddress.optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  approvalThreshold: z.coerce.number().int().min(1).max(20).optional(),
});

export const createSpendingProposalSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  tokenSymbol,
  amount: amountString,
  recipient: walletAddress,
  proposalId: z.string().uuid().optional().or(z.literal("")),
});

export const reviewSpendingProposalSchema = z.object({
  decision: z.enum(["approved", "rejected", "cancelled"]),
});

export const addTreasurySignerSchema = z.object({
  address: walletAddress,
});

export const updateApprovalThresholdSchema = z.object({
  approvalThreshold: z.coerce.number().int().min(1).max(20),
});

const rewardRecipient = z.object({
  address: walletAddress,
  amount: amountString,
});

export const createRewardDistributionSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  tokenSymbol,
  recipients: z.array(rewardRecipient).min(1).max(200),
});

export const updateRewardDistributionSchema = z.object({
  status: z.enum(["active", "cancelled", "completed"]),
});

export const payRewardRecipientSchema = z.object({
  txHash,
});

export const executeSpendingProposalSchema = z.object({
  txHash,
});

export const recordTreasuryTransactionSchema = z.object({
  tokenSymbol,
  amount: amountString,
  fromAddress: walletAddress,
  toAddress: walletAddress,
  txHash,
});

export const createPaymentRequestSchema = z.object({
  communityId: z.string().uuid().optional().or(z.literal("")),
  tokenSymbol,
  amount: amountString,
  memo: z.string().trim().max(280).optional().or(z.literal("")),
});

export const recordPaymentSchema = z.object({
  communityId: z.string().uuid().optional().or(z.literal("")),
  paymentRequestId: z.string().uuid().optional().or(z.literal("")),
  payeeAddress: walletAddress,
  tokenSymbol,
  amount: amountString,
  txHash,
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  environment: z.enum(["live", "test"]).optional(),
});

export const webhookEvents = z.array(z.string().trim().min(1).max(64)).max(50);

export const createWebhookEndpointSchema = z.object({
  url: z.string().trim().url().max(2048),
  events: webhookEvents.min(1),
  communityId: z.string().uuid().optional().or(z.literal("")),
});

export const updateWebhookEndpointSchema = z.object({
  url: z.string().trim().url().max(2048).optional(),
  events: webhookEvents.optional(),
  active: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type CreateQuestInput = z.infer<typeof createQuestSchema>;
export type UpdateQuestInput = z.infer<typeof updateQuestSchema>;
export type SubmitQuestProofInput = z.infer<typeof submitQuestProofSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
export type AwardReputationInput = z.infer<typeof awardReputationSchema>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
