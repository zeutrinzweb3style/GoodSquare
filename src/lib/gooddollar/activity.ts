import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  summarizeGdollarActivity,
  type GdollarActivitySummary,
} from "./metrics";

/**
 * Read the on-chain-verified G$ activity for a community and reduce it to the
 * numbers GoodBuilders asks teams to report: users, transactions and G$ volume.
 *
 * Everything here reads verified rows only — payments that settled, treasury
 * movements that were recorded against a real receipt, and reward payouts that
 * were paid. Nothing is estimated.
 */
export async function getGdollarActivity(
  communityId: string,
): Promise<GdollarActivitySummary> {
  const supabase = createServiceRoleClient();

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("payer_address, payee_address, token_symbol, amount")
    .eq("community_id", communityId)
    .eq("status", "verified");
  if (paymentsError) throw paymentsError;

  const { data: treasuryTransactions, error: treasuryError } = await supabase
    .from("treasury_transactions")
    .select("direction, token_symbol, amount, from_address, to_address")
    .eq("community_id", communityId);
  if (treasuryError) throw treasuryError;

  const { data: rewards, error: rewardsError } = await supabase
    .from("reward_recipients")
    .select("address, status, amount, reward_distributions!inner (community_id, token_symbol)")
    .eq("reward_distributions.community_id", communityId)
    .eq("status", "paid");
  if (rewardsError) throw rewardsError;

  return summarizeGdollarActivity({
    payments: (payments ?? []).map((row) => ({
      payer: row.payer_address,
      payee: row.payee_address,
      tokenSymbol: row.token_symbol,
      amount: row.amount,
    })),
    treasuryTransactions: (treasuryTransactions ?? []).map((row) => ({
      direction: row.direction,
      tokenSymbol: row.token_symbol,
      amount: row.amount,
      from: row.from_address,
      to: row.to_address,
    })),
    rewardRecipients: (rewards ?? []).map((row) => {
      const distribution = Array.isArray(row.reward_distributions)
        ? row.reward_distributions[0]
        : row.reward_distributions;
      return {
        address: row.address,
        status: row.status,
        tokenSymbol: distribution?.token_symbol ?? "",
        amount: row.amount,
      };
    }),
  });
}
