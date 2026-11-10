import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import { recordReputationEvent } from "@/lib/reputation/service";
import { emitWebhookEvent } from "@/lib/developer/webhook-service";
import { notify } from "@/lib/notifications/service";
import { queueQuestReward } from "@/lib/rewards/service";
import { getTreasuryByCommunity } from "@/lib/treasury/service";
import { getToken, isPayable } from "@/lib/treasury/tokens";
import { parseAmount, formatAmount } from "@/lib/treasury/amounts";
import { questRewardDecision } from "@/lib/quest/reward";
import type { Quest } from "@/lib/types";

export async function getQuestById(questId: string): Promise<Quest | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .eq("id", questId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listQuests(
  communityId: string,
  options: { status?: Quest["status"]; limit?: number } = {},
): Promise<Quest[]> {
  const { status, limit = 50 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("quests")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSubmission(questId: string, address: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quest_submissions")
    .select("*")
    .eq("quest_id", questId)
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listSubmissions(
  questId: string,
  options: { status?: "pending" | "approved" | "rejected"; limit?: number } = {},
) {
  const { status, limit = 100 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("quest_submissions")
    .select(
      "*, profiles:address (username, display_name, avatar_url)",
    )
    .eq("quest_id", questId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listCommunitySubmissions(
  communityId: string,
  options: { status?: "pending" | "approved" | "rejected"; limit?: number } = {},
) {
  const { status, limit = 100 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("quest_submissions")
    .select(
      "*, profiles:address (username, display_name, avatar_url), quests:quest_id (title, exp_reward, reward_token_symbol, reward_amount)",
    )
    .eq("community_id", communityId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createSubmission(entry: {
  quest: Quest;
  address: string;
  proofUrl?: string | null;
  proofText?: string | null;
}) {
  const supabase = createServiceRoleClient();
  const address = normalizeAddress(entry.address);

  const { data, error } = await supabase
    .from("quest_submissions")
    .insert({
      quest_id: entry.quest.id,
      community_id: entry.quest.community_id,
      address,
      proof_url: entry.proofUrl || null,
      proof_text: entry.proofText || null,
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;

  await writeAuditLog({
    actor: address,
    action: "quest.submit",
    entityType: "quest_submission",
    entityId: data?.id ?? null,
    communityId: entry.quest.community_id,
    metadata: { quest_id: entry.quest.id },
  });

  await emitWebhookEvent({
    event: "quest.submitted",
    communityId: entry.quest.community_id,
    data: {
      communityId: entry.quest.community_id,
      questId: entry.quest.id,
      submissionId: data?.id ?? null,
      address,
    },
  });

  return data;
}

/**
 * Approve or reject a submission. Approving awards the quest's EXP reward as a
 * reputation event. Each submission can only be reviewed while pending, so a
 * quest's EXP cannot be farmed by repeated approvals.
 */
export async function reviewSubmission(entry: {
  submissionId: string;
  reviewer: string;
  decision: "approved" | "rejected";
  note?: string | null;
}) {
  const supabase = createServiceRoleClient();
  const reviewer = normalizeAddress(entry.reviewer);

  const { data: submission, error: loadError } = await supabase
    .from("quest_submissions")
    .select("*")
    .eq("id", entry.submissionId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!submission) return { submission: null, quest: null } as const;

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("*")
    .eq("id", submission.quest_id)
    .maybeSingle();
  if (questError) throw questError;

  const { data: updated, error } = await supabase
    .from("quest_submissions")
    .update({
      status: entry.decision,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      review_note: entry.note || null,
    })
    .eq("id", entry.submissionId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!updated) {
    // Already reviewed by a concurrent request.
    return { submission: null, quest: quest as Quest | null } as const;
  }

  await supabase.from("quest_approvals").insert({
    submission_id: updated.id,
    quest_id: updated.quest_id,
    community_id: updated.community_id,
    reviewer,
    decision: entry.decision,
    note: entry.note || null,
  });

  if (entry.decision === "approved" && quest && quest.exp_reward > 0) {
    await recordReputationEvent({
      communityId: updated.community_id,
      address: updated.address,
      delta: quest.exp_reward,
      reason: `Quest approved: ${quest.title}`,
      sourceType: "quest",
      sourceId: quest.id,
      createdBy: reviewer,
    });
  }

  let reward: { token: string; amount: string; recipientId: string } | null = null;
  let rewardSkipped: string | null = null;
  if (entry.decision === "approved" && quest) {
    const queued = await queueRewardForApproval({
      quest: quest as Quest,
      submission: updated,
      reviewer,
    });
    reward = queued.reward;
    rewardSkipped = queued.skipped;
  }

  await writeAuditLog({
    actor: reviewer,
    action: `quest.${entry.decision}`,
    entityType: "quest_submission",
    entityId: updated.id,
    communityId: updated.community_id,
    metadata: { quest_id: updated.quest_id, decision: entry.decision },
  });

  if (entry.decision === "approved") {
    await emitWebhookEvent({
      event: "quest.approved",
      communityId: updated.community_id,
      data: {
        communityId: updated.community_id,
        questId: updated.quest_id,
        submissionId: updated.id,
        address: updated.address,
        expReward: quest?.exp_reward ?? 0,
      },
    });
  }

  return {
    submission: updated,
    quest: quest as Quest | null,
    reward,
    rewardSkipped,
  } as const;
}

/**
 * Queue the promised token reward for an approved submission. Never throws: a
 * missing treasury or an unpayable token skips the payout and the approval —
 * which already awarded EXP — still succeeds.
 */
async function queueRewardForApproval(input: {
  quest: Quest;
  submission: { id: string; community_id: string; address: string };
  reviewer: string;
}): Promise<{
  reward: { token: string; amount: string; recipientId: string } | null;
  skipped: string | null;
}> {
  const { quest, submission, reviewer } = input;
  try {
    const treasury = await getTreasuryByCommunity(submission.community_id);
    const token = treasury
      ? getToken(treasury.chain_id, quest.reward_token_symbol)
      : null;

    const decision = questRewardDecision({
      token: quest.reward_token_symbol,
      amount: quest.reward_amount,
      treasuryActive: Boolean(treasury?.is_active),
      tokenPayable: Boolean(treasury && isPayable(treasury.chain_id, quest.reward_token_symbol)),
    });

    if (decision.action === "none") return { reward: null, skipped: null };
    if (decision.action === "skip") {
      console.error("quest reward skipped", {
        questId: quest.id,
        reason: decision.reason,
      });
      return { reward: null, skipped: decision.reason };
    }

    const decimals = token?.decimals ?? 18;
    const amount = parseAmount(quest.reward_amount!, decimals);
    if (amount === null || amount <= 0n) {
      return { reward: null, skipped: "Reward amount is not valid for the token" };
    }

    const recipient = await queueQuestReward({
      treasury: treasury!,
      questId: quest.id,
      questTitle: quest.title,
      address: submission.address,
      tokenSymbol: quest.reward_token_symbol!,
      amount: amount.toString(),
      createdBy: reviewer,
    });

    const supabase = createServiceRoleClient();
    await supabase
      .from("quest_submissions")
      .update({ reward_recipient_id: recipient?.id ?? null })
      .eq("id", submission.id);

    await notify({
      address: submission.address,
      type: "quest.reward.queued",
      title: "Quest reward queued",
      body: `${quest.title}: ${formatAmount(amount, decimals)} ${quest.reward_token_symbol} will be paid from the community treasury.`,
      entityType: "reward_recipient",
      entityId: recipient?.id ?? null,
      communityId: submission.community_id,
    });

    await emitWebhookEvent({
      event: "quest.reward_queued",
      communityId: submission.community_id,
      address: submission.address,
      data: {
        communityId: submission.community_id,
        questId: quest.id,
        submissionId: submission.id,
        address: submission.address,
        tokenSymbol: quest.reward_token_symbol,
        amount: amount.toString(),
      },
    });

    return {
      reward: {
        token: quest.reward_token_symbol!,
        amount: formatAmount(amount, decimals),
        recipientId: recipient?.id ?? "",
      },
      skipped: null,
    };
  } catch (error) {
    console.error("queue quest reward error", error);
    return { reward: null, skipped: "The reward could not be queued" };
  }
}
