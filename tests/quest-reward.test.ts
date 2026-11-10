import test from "node:test";
import assert from "node:assert/strict";
import {
  QUEST_REWARD_TOKENS,
  hasQuestReward,
  isQuestRewardToken,
  normalizeQuestReward,
  questRewardDecision,
  questRewardLabel,
} from "../src/lib/quest/reward.ts";
import { TOKEN_SYMBOLS } from "../src/lib/treasury/tokens.ts";

// --- token allowlist ---------------------------------------------------------

test("quest reward tokens mirror the treasury token registry", () => {
  assert.deepEqual([...QUEST_REWARD_TOKENS], TOKEN_SYMBOLS);
});

test("isQuestRewardToken accepts known tokens only", () => {
  assert.equal(isQuestRewardToken("USDC"), true);
  assert.equal(isQuestRewardToken("G$"), true);
  assert.equal(isQuestRewardToken("DAI"), false);
  assert.equal(isQuestRewardToken(""), false);
});

// --- hasQuestReward ----------------------------------------------------------

test("hasQuestReward needs both a token and an amount", () => {
  assert.equal(
    hasQuestReward({ reward_token_symbol: "USDC", reward_amount: "5" }),
    true,
  );
  assert.equal(
    hasQuestReward({ reward_token_symbol: "USDC", reward_amount: null }),
    false,
  );
  assert.equal(
    hasQuestReward({ reward_token_symbol: null, reward_amount: "5" }),
    false,
  );
});

// --- normalizeQuestReward ----------------------------------------------------

test("normalizeQuestReward treats an empty pair as no reward", () => {
  assert.deepEqual(normalizeQuestReward("", ""), { ok: true, value: null });
  assert.deepEqual(normalizeQuestReward(null, undefined), {
    ok: true,
    value: null,
  });
  assert.deepEqual(normalizeQuestReward("  ", "  "), { ok: true, value: null });
});

test("normalizeQuestReward rejects a half-filled pair", () => {
  const missingAmount = normalizeQuestReward("USDC", "");
  assert.equal(missingAmount.ok, false);

  const missingToken = normalizeQuestReward("", "5");
  assert.equal(missingToken.ok, false);
});

test("normalizeQuestReward rejects unknown tokens and bad amounts", () => {
  assert.equal(normalizeQuestReward("DAI", "5").ok, false);
  assert.equal(normalizeQuestReward("USDC", "0").ok, false);
  assert.equal(normalizeQuestReward("USDC", "-1").ok, false);
  assert.equal(normalizeQuestReward("USDC", "1e3").ok, false);
  assert.equal(normalizeQuestReward("USDC", "abc").ok, false);
});

test("normalizeQuestReward accepts a positive decimal", () => {
  assert.deepEqual(normalizeQuestReward("usdc", " 1.5 "), {
    ok: true,
    value: { token: "USDC", amount: "1.5" },
  });
  assert.deepEqual(normalizeQuestReward("CELO", "10"), {
    ok: true,
    value: { token: "CELO", amount: "10" },
  });
});

// --- questRewardDecision -----------------------------------------------------

test("questRewardDecision queues a payable reward on an active treasury", () => {
  assert.deepEqual(
    questRewardDecision({
      token: "USDC",
      amount: "5",
      treasuryActive: true,
      tokenPayable: true,
    }),
    { action: "queue" },
  );
});

test("questRewardDecision does nothing when no reward is promised", () => {
  assert.deepEqual(
    questRewardDecision({
      token: null,
      amount: null,
      treasuryActive: true,
      tokenPayable: true,
    }),
    { action: "none" },
  );
});

test("questRewardDecision skips when the treasury is inactive or token unpayable", () => {
  const inactive = questRewardDecision({
    token: "USDC",
    amount: "5",
    treasuryActive: false,
    tokenPayable: true,
  });
  assert.equal(inactive.action, "skip");

  const unpayable = questRewardDecision({
    token: "USDT",
    amount: "5",
    treasuryActive: true,
    tokenPayable: false,
  });
  assert.equal(unpayable.action, "skip");
});

// --- questRewardLabel --------------------------------------------------------

test("questRewardLabel formats only a complete reward", () => {
  assert.equal(questRewardLabel("USDC", "5"), "5 USDC");
  assert.equal(questRewardLabel("USDC", null), null);
  assert.equal(questRewardLabel(null, "5"), null);
});
