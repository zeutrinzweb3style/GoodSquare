import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalCount,
  approvalProgress,
  canApprove,
  canRevokeApproval,
  distinctApprovers,
  effectiveThreshold,
  isSigner,
  normalizeSigner,
  thresholdReached,
} from "../src/lib/treasury/approvals.ts";
import {
  canDistribute,
  canPayRecipient,
  canTransitionReward,
  distributionProgress,
  duplicateRecipients,
  isDistributionComplete,
  isRewardTerminal,
  normalizeRewardAddress,
  totalRewardAmount,
} from "../src/lib/rewards/rules.ts";

const SIGNERS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
];

// --- approvals ---------------------------------------------------------------

test("normalizeSigner lowercases and trims", () => {
  assert.equal(normalizeSigner("  0xABC  "), "0xabc");
});

test("isSigner matches case-insensitively", () => {
  assert.equal(isSigner(SIGNERS, SIGNERS[0].toUpperCase()), true);
  assert.equal(isSigner(SIGNERS, "0x9999999999999999999999999999999999999999"), false);
});

test("effectiveThreshold is at least 1 and never above the signer count", () => {
  assert.equal(effectiveThreshold(0, 3), 1);
  assert.equal(effectiveThreshold(3, 0), 1);
  assert.equal(effectiveThreshold(3, 5), 3);
  assert.equal(effectiveThreshold(3, 2), 2);
});

test("distinctApprovers dedupes and normalizes", () => {
  const approvers = distinctApprovers([
    { approver: "0xAAA" },
    { approver: "0xaaa" },
    { approver: "0xBBB" },
  ]);
  assert.deepEqual(approvers, ["0xaaa", "0xbbb"]);
});

test("approvalCount ignores non-signers and duplicates", () => {
  const approvals = [
    { approver: SIGNERS[0] },
    { approver: SIGNERS[0].toUpperCase() },
    { approver: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
  ];
  assert.equal(approvalCount(approvals, SIGNERS), 1);
});

test("canApprove rejects non-pending, non-signers, and double approvals", () => {
  assert.equal(
    canApprove({
      proposalStatus: "approved",
      signers: SIGNERS,
      approvals: [],
      approver: SIGNERS[0],
    }).ok,
    false,
  );
  assert.equal(
    canApprove({
      proposalStatus: "pending",
      signers: SIGNERS,
      approvals: [],
      approver: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    }).ok,
    false,
  );
  assert.equal(
    canApprove({
      proposalStatus: "pending",
      signers: SIGNERS,
      approvals: [{ approver: SIGNERS[0] }],
      approver: SIGNERS[0].toUpperCase(),
    }).ok,
    false,
  );
  assert.equal(
    canApprove({
      proposalStatus: "pending",
      signers: SIGNERS,
      approvals: [],
      approver: SIGNERS[0],
    }).ok,
    true,
  );
});

test("canRevokeApproval requires a prior approval on a pending proposal", () => {
  assert.equal(
    canRevokeApproval({
      proposalStatus: "pending",
      approvals: [{ approver: SIGNERS[0] }],
      approver: SIGNERS[0],
    }).ok,
    true,
  );
  assert.equal(
    canRevokeApproval({
      proposalStatus: "pending",
      approvals: [],
      approver: SIGNERS[0],
    }).ok,
    false,
  );
});

test("thresholdReached flips at the configured number of distinct signers", () => {
  assert.equal(
    thresholdReached({ signers: SIGNERS, approvals: [], threshold: 2 }),
    false,
  );
  assert.equal(
    thresholdReached({
      signers: SIGNERS,
      approvals: [{ approver: SIGNERS[0] }, { approver: SIGNERS[1] }],
      threshold: 2,
    }),
    true,
  );
  // A non-signer's approval never counts toward the threshold.
  assert.equal(
    thresholdReached({
      signers: SIGNERS,
      approvals: [
        { approver: SIGNERS[0] },
        { approver: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
      ],
      threshold: 2,
    }),
    false,
  );
});

test("thresholdReached with no signers defaults to a single approval", () => {
  assert.equal(thresholdReached({ signers: [], approvals: [], threshold: 1 }), false);
  assert.equal(
    thresholdReached({ signers: [], approvals: [], threshold: 1 }),
    false,
  );
});

test("approvalProgress reports approved vs required", () => {
  assert.deepEqual(
    approvalProgress({
      signers: SIGNERS,
      approvals: [{ approver: SIGNERS[0] }],
      threshold: 2,
    }),
    { approved: 1, required: 2 },
  );
});

// --- reward rules ------------------------------------------------------------

test("reward lifecycle transitions are enforced", () => {
  assert.equal(canTransitionReward("draft", "active"), true);
  assert.equal(canTransitionReward("draft", "completed"), false);
  assert.equal(canTransitionReward("active", "completed"), true);
  assert.equal(canTransitionReward("active", "cancelled"), true);
  assert.equal(canTransitionReward("completed", "active"), false);
  assert.equal(canTransitionReward("cancelled", "draft"), false);
});

test("terminal reward statuses have no outgoing transitions", () => {
  assert.equal(isRewardTerminal("completed"), true);
  assert.equal(isRewardTerminal("cancelled"), true);
  assert.equal(isRewardTerminal("active"), false);
});

test("normalizeRewardAddress lowercases", () => {
  assert.equal(normalizeRewardAddress(" 0xAB "), "0xab");
});

test("duplicateRecipients finds repeats case-insensitively", () => {
  const duplicates = duplicateRecipients([
    { address: "0xAAA", amount: 1n },
    { address: "0xaaa", amount: 2n },
    { address: "0xBBB", amount: 3n },
  ]);
  assert.deepEqual(duplicates, ["0xaaa"]);
});

test("totalRewardAmount sums base units", () => {
  assert.equal(
    totalRewardAmount([
      { address: "0xa", amount: 100n },
      { address: "0xb", amount: 250n },
    ]),
    350n,
  );
});

test("canDistribute requires an active treasury, recipients, and balance", () => {
  const recipients = [{ address: "0xa", amount: 100n }];
  assert.equal(
    canDistribute({
      status: "draft",
      treasuryActive: false,
      balance: null,
      recipients,
    }).ok,
    false,
  );
  assert.equal(
    canDistribute({
      status: "draft",
      treasuryActive: true,
      balance: null,
      recipients: [],
    }).ok,
    false,
  );
  assert.equal(
    canDistribute({
      status: "draft",
      treasuryActive: true,
      balance: 50n,
      recipients,
    }).ok,
    false,
  );
  assert.equal(
    canDistribute({
      status: "draft",
      treasuryActive: true,
      balance: 100n,
      recipients,
    }).ok,
    true,
  );
});

test("canDistribute rejects duplicate and non-positive amounts", () => {
  assert.equal(
    canDistribute({
      status: "active",
      treasuryActive: true,
      balance: null,
      recipients: [
        { address: "0xa", amount: 1n },
        { address: "0xA", amount: 1n },
      ],
    }).ok,
    false,
  );
  assert.equal(
    canDistribute({
      status: "active",
      treasuryActive: true,
      balance: null,
      recipients: [{ address: "0xa", amount: 0n }],
    }).ok,
    false,
  );
});

test("canPayRecipient only allows pending recipients on an active distribution", () => {
  assert.equal(
    canPayRecipient({ distributionStatus: "draft", recipientStatus: "pending" }).ok,
    false,
  );
  assert.equal(
    canPayRecipient({ distributionStatus: "active", recipientStatus: "paid" }).ok,
    false,
  );
  assert.equal(
    canPayRecipient({ distributionStatus: "active", recipientStatus: "pending" }).ok,
    true,
  );
});

test("isDistributionComplete needs at least one recipient with none pending", () => {
  assert.equal(isDistributionComplete([]), false);
  assert.equal(isDistributionComplete([{ status: "pending" }]), false);
  assert.equal(
    isDistributionComplete([{ status: "paid" }, { status: "skipped" }]),
    true,
  );
});

test("distributionProgress reports paid count and outstanding amount", () => {
  const progress = distributionProgress([
    { status: "paid", amount: 100n },
    { status: "pending", amount: 40n },
    { status: "skipped", amount: 10n },
  ]);
  assert.equal(progress.paid, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.outstanding, 40n);
});
