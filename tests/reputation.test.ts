import test from "node:test";
import assert from "node:assert/strict";
import {
  REPUTATION_LEVELS,
  expToNextLevel,
  levelForExp,
  levelProgress,
} from "../src/lib/reputation/levels.ts";

test("level boundaries follow the proposal table", () => {
  assert.equal(levelForExp(0).name, "Newcomer");
  assert.equal(levelForExp(99).name, "Newcomer");
  assert.equal(levelForExp(100).name, "Contributor");
  assert.equal(levelForExp(499).name, "Contributor");
  assert.equal(levelForExp(500).name, "Active Member");
  assert.equal(levelForExp(999).name, "Active Member");
  assert.equal(levelForExp(1000).name, "Builder");
  assert.equal(levelForExp(2499).name, "Builder");
  assert.equal(levelForExp(2500).name, "Ambassador");
  assert.equal(levelForExp(4999).name, "Ambassador");
  assert.equal(levelForExp(5000).name, "Champion");
  assert.equal(levelForExp(999999).name, "Champion");
});

test("negative and fractional EXP clamp safely", () => {
  assert.equal(levelForExp(-50).name, "Newcomer");
  assert.equal(levelForExp(100.9).name, "Contributor");
});

test("levels are ordered and contiguous", () => {
  for (let i = 1; i < REPUTATION_LEVELS.length; i += 1) {
    const prev = REPUTATION_LEVELS[i - 1];
    const current = REPUTATION_LEVELS[i];
    assert.equal(prev.max! + 1, current.min);
  }
  assert.equal(REPUTATION_LEVELS.at(-1)!.max, null);
});

test("expToNextLevel reports distance to the next threshold", () => {
  assert.equal(expToNextLevel(0), 100);
  assert.equal(expToNextLevel(90), 10);
  assert.equal(expToNextLevel(100), 400);
  assert.equal(expToNextLevel(5000), null);
});

test("levelProgress stays within 0..1", () => {
  assert.equal(levelProgress(0), 0);
  assert.ok(levelProgress(50) > 0 && levelProgress(50) < 1);
  assert.equal(levelProgress(5000), 1);
});
