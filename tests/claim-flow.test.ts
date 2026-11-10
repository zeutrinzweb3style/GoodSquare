import test from "node:test";
import assert from "node:assert/strict";
import {
  claimFlowReducer,
  claimStepInfo,
  formatCountdown,
  initialClaimFlow,
  msUntil,
  resolveClaimView,
  type ClaimFlowPhase,
} from "../src/lib/gooddollar/claim-flow.ts";

test("the happy double-claim path walks confirming to success", () => {
  let phase: ClaimFlowPhase = initialClaimFlow;
  phase = claimFlowReducer(phase, { type: "start" });
  assert.deepEqual(phase, { kind: "preparing" });

  phase = claimFlowReducer(phase, { type: "confirm-required", message: "two tx?" });
  assert.deepEqual(phase, { kind: "confirming", message: "two tx?" });

  phase = claimFlowReducer(phase, { type: "confirm-accepted" });
  assert.deepEqual(phase, { kind: "preparing" });

  phase = claimFlowReducer(phase, { type: "submitted", hash: "0xabc" });
  assert.deepEqual(phase, { kind: "submitting", hash: "0xabc" });

  phase = claimFlowReducer(phase, { type: "succeeded", hash: "0xabc" });
  assert.deepEqual(phase, { kind: "success", hash: "0xabc" });
});

test("declining the faucet prompt stops the flow", () => {
  let phase = claimFlowReducer(initialClaimFlow, { type: "start" });
  phase = claimFlowReducer(phase, { type: "confirm-required", message: "two tx?" });
  phase = claimFlowReducer(phase, { type: "confirm-declined" });
  assert.deepEqual(phase, { kind: "declined" });
});

test("a declined flow ignores a late success event", () => {
  let phase = claimFlowReducer(initialClaimFlow, { type: "start" });
  phase = claimFlowReducer(phase, { type: "confirm-required", message: "two tx?" });
  phase = claimFlowReducer(phase, { type: "confirm-declined" });
  phase = claimFlowReducer(phase, { type: "succeeded", hash: "0xabc" });
  assert.deepEqual(phase, { kind: "declined" });
});

test("a failure after broadcast keeps the submitted hash behind the error", () => {
  let phase = claimFlowReducer(initialClaimFlow, { type: "start" });
  phase = claimFlowReducer(phase, { type: "submitted", hash: "0xabc" });
  phase = claimFlowReducer(phase, { type: "failed", message: "reverted" });
  assert.deepEqual(phase, { kind: "failed", message: "reverted", hash: "0xabc" });
});

test("a failure before any broadcast carries no hash", () => {
  let phase = claimFlowReducer(initialClaimFlow, { type: "start" });
  phase = claimFlowReducer(phase, { type: "failed", message: "no balance" });
  assert.deepEqual(phase, { kind: "failed", message: "no balance" });
});

test("stray events are ignored and never corrupt the phase", () => {
  assert.deepEqual(
    claimFlowReducer(initialClaimFlow, { type: "submitted", hash: "0x1" }),
    { kind: "idle" },
  );
  assert.deepEqual(
    claimFlowReducer(initialClaimFlow, { type: "confirm-required", message: "x" }),
    { kind: "idle" },
  );
  const success: ClaimFlowPhase = { kind: "success", hash: "0xabc" };
  assert.deepEqual(
    claimFlowReducer(success, { type: "failed", message: "late" }),
    success,
  );
});

test("reset returns to idle", () => {
  const phase = claimFlowReducer({ kind: "failed", message: "x" }, { type: "reset" });
  assert.deepEqual(phase, { kind: "idle" });
});

test("verification runs in place and returns to the status-driven screen", () => {
  let phase = claimFlowReducer(initialClaimFlow, { type: "verify-started" });
  assert.deepEqual(phase, { kind: "verifying" });
  assert.equal(
    resolveClaimView({ status: "not_whitelisted", chainSupported: true, phase }),
    "verifying",
  );

  phase = claimFlowReducer(phase, { type: "verify-finished" });
  assert.deepEqual(phase, { kind: "idle" });
  assert.equal(
    resolveClaimView({ status: "can_claim", chainSupported: true, phase }),
    "intro",
  );
});

test("verification events only apply from their matching phase", () => {
  // Cannot start verifying while a claim is already preparing.
  const preparing: ClaimFlowPhase = { kind: "preparing" };
  assert.deepEqual(claimFlowReducer(preparing, { type: "verify-started" }), preparing);
  // A stray finish is ignored when we are not verifying.
  assert.deepEqual(
    claimFlowReducer(initialClaimFlow, { type: "verify-finished" }),
    initialClaimFlow,
  );
});

test("resolveClaimView prefers an in-flight phase over wallet status", () => {
  assert.equal(
    resolveClaimView({
      status: "can_claim",
      chainSupported: true,
      phase: { kind: "submitting", hash: "0x1" },
    }),
    "submitting",
  );
  assert.equal(
    resolveClaimView({
      status: "already_claimed",
      chainSupported: true,
      phase: { kind: "confirming", message: "x" },
    }),
    "confirming",
  );
});

test("resolveClaimView gates on chain and claim status when idle", () => {
  assert.equal(
    resolveClaimView({ status: "can_claim", chainSupported: false, phase: initialClaimFlow }),
    "wrong_chain",
  );
  assert.equal(
    resolveClaimView({
      status: "already_claimed",
      chainSupported: true,
      phase: initialClaimFlow,
    }),
    "already_claimed",
  );
  assert.equal(
    resolveClaimView({ status: "can_claim", chainSupported: true, phase: initialClaimFlow }),
    "intro",
  );
  assert.equal(
    resolveClaimView({ status: null, chainSupported: true, phase: initialClaimFlow }),
    "intro",
  );
  assert.equal(
    resolveClaimView({
      status: "not_whitelisted",
      chainSupported: true,
      phase: initialClaimFlow,
    }),
    "not_verified",
  );
});

test("claimStepInfo marks the two-signature flow", () => {
  assert.deepEqual(claimStepInfo("confirming"), {
    step: 1,
    total: 2,
    label: "Confirm top-up",
  });
  assert.deepEqual(claimStepInfo("submitting"), {
    step: 2,
    total: 2,
    label: "Claiming",
  });
  assert.equal(claimStepInfo("intro"), null);
  assert.equal(claimStepInfo("already_claimed"), null);
});

test("formatCountdown renders HH:MM:SS and clamps at zero", () => {
  assert.equal(formatCountdown(0), "00:00:00");
  assert.equal(formatCountdown(-5000), "00:00:00");
  assert.equal(formatCountdown(1000), "00:00:01");
  assert.equal(formatCountdown(23 * 3600_000 + 58 * 60_000 + 1000), "23:58:01");
});

test("msUntil measures forward and clamps past targets", () => {
  const now = 1_000_000;
  assert.equal(msUntil(now + 5000, now), 5000);
  assert.equal(msUntil(now - 5000, now), 0);
  assert.equal(msUntil(null, now), 0);
  assert.equal(msUntil(undefined, now), 0);
  assert.equal(msUntil(new Date(now + 2500), now), 2500);
});
