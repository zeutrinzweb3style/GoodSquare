import test from "node:test";
import assert from "node:assert/strict";
import {
  isVotingOpen,
  resolveVote,
  votingPhase,
} from "../src/lib/governance/results.ts";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-01-01T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

test("votingPhase tracks the window and status", () => {
  assert.equal(
    votingPhase(
      {
        status: "active",
        voting_starts_at: iso(now + HOUR),
        voting_ends_at: iso(now + 2 * HOUR),
      },
      now,
    ),
    "not-started",
  );
  assert.equal(
    votingPhase(
      {
        status: "active",
        voting_starts_at: iso(now - HOUR),
        voting_ends_at: iso(now + HOUR),
      },
      now,
    ),
    "open",
  );
  assert.equal(
    votingPhase(
      {
        status: "active",
        voting_starts_at: iso(now - 2 * HOUR),
        voting_ends_at: iso(now - HOUR),
      },
      now,
    ),
    "ended",
  );
});

test("open-ended proposals stay open", () => {
  assert.equal(
    votingPhase(
      { status: "active", voting_starts_at: null, voting_ends_at: null },
      now,
    ),
    "open",
  );
});

test("cancelled proposals never accept votes", () => {
  assert.equal(
    isVotingOpen(
      {
        status: "cancelled",
        voting_starts_at: iso(now - HOUR),
        voting_ends_at: iso(now + HOUR),
      },
      now,
    ),
    false,
  );
});

test("draft proposals are not open even inside the window", () => {
  assert.equal(
    isVotingOpen(
      {
        status: "draft",
        voting_starts_at: iso(now - HOUR),
        voting_ends_at: iso(now + HOUR),
      },
      now,
    ),
    false,
  );
});

test("majority passes when quorum and approval are met", () => {
  const result = resolveVote(
    { votes_for: 7, votes_against: 3, votes_abstain: 0 },
    { quorum_percent: 50, approval_threshold: 50 },
    10,
  );
  assert.equal(result.passed, true);
  assert.equal(result.approval_share, 0.7);
  assert.equal(result.quorum_met, true);
  assert.equal(result.approval_met, true);
});

test("fails when quorum is not reached", () => {
  const result = resolveVote(
    { votes_for: 5, votes_against: 0, votes_abstain: 0 },
    { quorum_percent: 80, approval_threshold: 50 },
    10,
  );
  assert.equal(result.quorum_met, false);
  assert.equal(result.passed, false);
});

test("fails when approval is below the threshold", () => {
  const result = resolveVote(
    { votes_for: 4, votes_against: 6, votes_abstain: 0 },
    { quorum_percent: 0, approval_threshold: 50 },
    10,
  );
  assert.equal(result.approval_met, false);
  assert.equal(result.passed, false);
});

test("abstentions count toward quorum but not approval", () => {
  const result = resolveVote(
    { votes_for: 6, votes_against: 0, votes_abstain: 4 },
    { quorum_percent: 100, approval_threshold: 50 },
    10,
  );
  assert.equal(result.total_votes, 10);
  assert.equal(result.decisive_votes, 6);
  assert.equal(result.approval_share, 1);
  assert.equal(result.quorum_met, true);
  assert.equal(result.passed, true);
});

test("a zero quorum rule needs no minimum participation", () => {
  const result = resolveVote(
    { votes_for: 1, votes_against: 0, votes_abstain: 0 },
    { quorum_percent: 0, approval_threshold: 50 },
    1000,
  );
  assert.equal(result.quorum_met, true);
  assert.equal(result.passed, true);
});

test("a tie exactly at the threshold passes (comparison is inclusive)", () => {
  const result = resolveVote(
    { votes_for: 5, votes_against: 5, votes_abstain: 0 },
    { quorum_percent: 0, approval_threshold: 50 },
    10,
  );
  assert.equal(result.approval_share, 0.5);
  assert.equal(result.passed, true);
});

test("no votes means no approval and no pass", () => {
  const result = resolveVote(
    { votes_for: 0, votes_against: 0, votes_abstain: 0 },
    { quorum_percent: 0, approval_threshold: 50 },
    10,
  );
  assert.equal(result.approval_share, null);
  assert.equal(result.passed, false);
  assert.equal(result.participation_share, 0);
});

test("unknown eligibility yields a null participation share", () => {
  const result = resolveVote(
    { votes_for: 3, votes_against: 0, votes_abstain: 0 },
    { quorum_percent: 10, approval_threshold: 50 },
    0,
  );
  assert.equal(result.participation_share, null);
  assert.equal(result.quorum_met, false);
});
