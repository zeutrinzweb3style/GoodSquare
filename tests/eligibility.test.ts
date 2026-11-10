import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCitizenship } from "../src/lib/gooddollar/eligibility.ts";

const NOW = 1_700_000_000;

function status(overrides: Partial<Parameters<typeof evaluateCitizenship>[0]> = {}) {
  return {
    isWhitelisted: true,
    lastAuthenticated: NOW - 100,
    authenticationPeriod: 1000,
    ...overrides,
  };
}

test("a whitelisted, unexpired wallet is verified", () => {
  const result = evaluateCitizenship(status(), NOW);
  assert.equal(result.verified, true);
  assert.equal(result.reason, undefined);
});

test("a missing identity status is not verified", () => {
  assert.equal(evaluateCitizenship(null, NOW).verified, false);
  assert.equal(evaluateCitizenship(undefined, NOW).verified, false);
});

test("a wallet that is not whitelisted is not verified", () => {
  const result = evaluateCitizenship(status({ isWhitelisted: false }), NOW);
  assert.equal(result.verified, false);
  assert.match(result.reason ?? "", /Verify your GoodDollar identity/);
});

test("an expired verification is not verified", () => {
  const result = evaluateCitizenship(
    status({ lastAuthenticated: NOW - 2000, authenticationPeriod: 1000 }),
    NOW,
  );
  assert.equal(result.verified, false);
  assert.match(result.reason ?? "", /expired/i);
});

test("verification exactly at the period boundary is still valid", () => {
  const result = evaluateCitizenship(
    status({ lastAuthenticated: NOW - 1000, authenticationPeriod: 1000 }),
    NOW,
  );
  assert.equal(result.verified, true);
});

test("an unknown authentication period falls back to the whitelist flag", () => {
  assert.equal(
    evaluateCitizenship(
      status({ lastAuthenticated: null, authenticationPeriod: null }),
      NOW,
    ).verified,
    true,
  );
});
