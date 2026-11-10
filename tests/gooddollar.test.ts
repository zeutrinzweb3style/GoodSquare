import test from "node:test";
import assert from "node:assert/strict";
import {
  G_DOLLAR_DECIMALS,
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_CELO_CONTRACTS,
  celoAddressUrl,
  celoTxUrl,
  describeClaimStatus,
  formatUnits,
  isGoodDollarSupportedChain,
  unsupportedChainReason,
} from "../src/lib/gooddollar/config.ts";

test("only Celo mainnet is a supported GoodDollar chain", () => {
  assert.equal(isGoodDollarSupportedChain(GOODDOLLAR_CELO_CHAIN_ID), true);
  assert.equal(isGoodDollarSupportedChain(42220), true);
  // No testnet deployment exists.
  assert.equal(isGoodDollarSupportedChain(11142220), false);
  // Other mainnets are out of scope for this integration.
  assert.equal(isGoodDollarSupportedChain(122), false);
  assert.equal(isGoodDollarSupportedChain(50), false);
  assert.equal(isGoodDollarSupportedChain(1), false);
  assert.equal(isGoodDollarSupportedChain(null), false);
  assert.equal(isGoodDollarSupportedChain(undefined), false);
});

test("unsupportedChainReason distinguishes missing wallet from wrong chain", () => {
  assert.match(unsupportedChainReason(null), /Connect your wallet/i);
  assert.match(unsupportedChainReason(11142220), /Celo mainnet only/i);
});

test("contract addresses are the verified Celo mainnet set", () => {
  assert.equal(
    GOODDOLLAR_CELO_CONTRACTS.identity,
    "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
  );
  assert.equal(
    GOODDOLLAR_CELO_CONTRACTS.ubi,
    "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1",
  );
  assert.equal(
    GOODDOLLAR_CELO_CONTRACTS.gDollar,
    "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
  );
});

test("explorer links point at Celo mainnet", () => {
  assert.equal(
    celoAddressUrl("0xabc"),
    "https://celoscan.io/address/0xabc",
  );
  assert.equal(celoTxUrl("0xdef"), "https://celoscan.io/tx/0xdef");
});

test("formatUnits renders G$ base units with 18 decimals", () => {
  assert.equal(formatUnits(0n), "0");
  assert.equal(formatUnits(1n), "0.000000000000000001");
  assert.equal(formatUnits(10n ** 18n), "1");
  assert.equal(formatUnits(15n * 10n ** 17n), "1.5");
  assert.equal(formatUnits(123_456_000_000_000_000_000n), "123.456");
  assert.equal(formatUnits(-(10n ** 18n)), "-1");
  assert.equal(G_DOLLAR_DECIMALS, 18);
});

test("formatUnits honours a custom decimal count", () => {
  assert.equal(formatUnits(1_500_000n, 6), "1.5");
  assert.equal(formatUnits(1n, 0), "1");
});

test("describeClaimStatus maps every status to copy", () => {
  assert.deepEqual(describeClaimStatus("not_whitelisted"), {
    label: "Not verified yet",
    tone: "warning",
  });
  assert.deepEqual(describeClaimStatus("can_claim"), {
    label: "Ready to claim",
    tone: "success",
  });
  assert.deepEqual(describeClaimStatus("already_claimed"), {
    label: "Already claimed today",
    tone: "muted",
  });
});
