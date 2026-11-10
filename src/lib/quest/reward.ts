/**
 * Quest reward rules.
 *
 * A quest may optionally promise a token reward per approved submission. These
 * rules decide whether an approval should queue a treasury payout, and they are
 * pure so they can be unit tested without a database. They mirror the treasury
 * token allowlist; a test asserts the two stay in step.
 *
 * Nothing here sends funds. Good Square records a plan and verifies the receipt
 * a treasury signer submits — the same non-custodial model as Community Rewards.
 */

export const QUEST_REWARD_TOKENS = ["CELO", "cUSD", "USDC", "USDT", "G$"] as const;

export type QuestRewardToken = (typeof QUEST_REWARD_TOKENS)[number];

const DECIMAL_RE = /^\d+(\.\d+)?$/;

export function isQuestRewardToken(value: string): value is QuestRewardToken {
  return (QUEST_REWARD_TOKENS as readonly string[]).includes(value);
}

/** Whether a quest promises a token reward (both fields present). */
export function hasQuestReward(quest: {
  reward_token_symbol: string | null;
  reward_amount: string | null;
}): boolean {
  return Boolean(quest.reward_token_symbol && quest.reward_amount);
}

export type QuestRewardPair = { token: QuestRewardToken; amount: string };

export type NormalizeQuestRewardResult =
  | { ok: true; value: QuestRewardPair | null }
  | { ok: false; reason: string };

/**
 * Validate a token/amount pair from a create or update request. An empty pair
 * clears the reward (`value: null`); a half-filled pair is rejected, so a quest
 * never ends up promising an amount with no token or vice versa.
 */
export function normalizeQuestReward(
  token: string | null | undefined,
  amount: string | null | undefined,
): NormalizeQuestRewardResult {
  const t = (token ?? "").trim().toUpperCase();
  const a = (amount ?? "").trim();

  if (t === "" && a === "") return { ok: true, value: null };
  if (t === "" || a === "") {
    return { ok: false, reason: "Set both a reward token and a reward amount" };
  }
  if (!isQuestRewardToken(t)) {
    return { ok: false, reason: "That reward token is not supported" };
  }
  if (!DECIMAL_RE.test(a) || Number(a) <= 0) {
    return { ok: false, reason: "Enter a reward amount greater than zero" };
  }
  return { ok: true, value: { token: t, amount: a } };
}

export type QuestRewardDecision =
  | { action: "none" }
  | { action: "skip"; reason: string }
  | { action: "queue" };

/**
 * Whether approving a submission should queue a reward recipient. A promised
 * reward that cannot be queued is skipped with a reason: it never blocks the
 * approval, which always awards EXP.
 */
export function questRewardDecision(input: {
  token: string | null;
  amount: string | null;
  treasuryActive: boolean;
  tokenPayable: boolean;
}): QuestRewardDecision {
  if (!input.token || !input.amount) return { action: "none" };
  if (!input.treasuryActive) {
    return { action: "skip", reason: "Community treasury is not active" };
  }
  if (!input.tokenPayable) {
    return {
      action: "skip",
      reason: "Reward token is not payable on the treasury network",
    };
  }
  return { action: "queue" };
}

/** Human label for a reward, e.g. "5 USDC". */
export function questRewardLabel(
  token: string | null,
  amount: string | null,
): string | null {
  if (!token || !amount) return null;
  return `${amount} ${token}`;
}
