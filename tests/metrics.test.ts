import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGdollarActivity } from "../src/lib/gooddollar/metrics.ts";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

test("an empty community has zero activity", () => {
  const summary = summarizeGdollarActivity({
    payments: [],
    treasuryTransactions: [],
    rewardRecipients: [],
  });
  assert.equal(summary.volume, 0n);
  assert.equal(summary.transactions, 0);
  assert.equal(summary.uniqueWallets, 0);
});

test("G$ payments add volume, transactions and distinct wallets", () => {
  const summary = summarizeGdollarActivity({
    payments: [
      { payer: A, payee: B, tokenSymbol: "G$", amount: "1000" },
      { payer: A, payee: C, tokenSymbol: "G$", amount: "500" },
    ],
    treasuryTransactions: [],
    rewardRecipients: [],
  });
  assert.equal(summary.payments.count, 2);
  assert.equal(summary.payments.volume, 1500n);
  assert.equal(summary.volume, 1500n);
  assert.equal(summary.transactions, 2);
  assert.equal(summary.uniqueWallets, 3);
});

test("non-G$ tokens are excluded from every number", () => {
  const summary = summarizeGdollarActivity({
    payments: [
      { payer: A, payee: B, tokenSymbol: "cUSD", amount: "999999" },
      { payer: A, payee: B, tokenSymbol: "G$", amount: "42" },
    ],
    treasuryTransactions: [
      {
        direction: "in",
        tokenSymbol: "USDC",
        amount: "5000000",
        from: A,
        to: B,
      },
    ],
    rewardRecipients: [
      { address: C, status: "paid", tokenSymbol: "CELO", amount: "1" },
    ],
  });
  assert.equal(summary.payments.count, 1);
  assert.equal(summary.volume, 42n);
  assert.equal(summary.transactions, 1);
  assert.equal(summary.uniqueWallets, 2);
  assert.equal(summary.treasury.inVolume, 0n);
  assert.equal(summary.rewards.paidCount, 0);
});

test("only paid G$ rewards count toward volume", () => {
  const summary = summarizeGdollarActivity({
    payments: [],
    treasuryTransactions: [],
    rewardRecipients: [
      { address: A, status: "paid", tokenSymbol: "G$", amount: "100" },
      { address: B, status: "pending", tokenSymbol: "G$", amount: "100" },
      { address: C, status: "skipped", tokenSymbol: "G$", amount: "100" },
    ],
  });
  assert.equal(summary.rewards.paidCount, 1);
  assert.equal(summary.rewards.paidVolume, 100n);
  assert.equal(summary.volume, 100n);
  assert.equal(summary.uniqueWallets, 1);
});

test("treasury in and out are tracked separately and never netted", () => {
  const summary = summarizeGdollarActivity({
    payments: [],
    treasuryTransactions: [
      {
        direction: "in",
        tokenSymbol: "G$",
        amount: "10000",
        from: A,
        to: B,
      },
      {
        direction: "out",
        tokenSymbol: "G$",
        amount: "4000",
        from: B,
        to: C,
      },
    ],
    rewardRecipients: [],
  });
  assert.equal(summary.treasury.inVolume, 10000n);
  assert.equal(summary.treasury.outVolume, 4000n);
  // Treasury movements are funding, not utility, so they stay out of volume.
  assert.equal(summary.volume, 0n);
  assert.equal(summary.uniqueWallets, 3);
});

test("address casing does not double-count a wallet", () => {
  const summary = summarizeGdollarActivity({
    payments: [
      { payer: A.toUpperCase(), payee: B, tokenSymbol: "G$", amount: "1" },
      { payer: A, payee: B, tokenSymbol: "G$", amount: "1" },
    ],
    treasuryTransactions: [],
    rewardRecipients: [],
  });
  assert.equal(summary.uniqueWallets, 2);
});

test("a malformed amount is treated as zero rather than throwing", () => {
  const summary = summarizeGdollarActivity({
    payments: [{ payer: A, payee: B, tokenSymbol: "G$", amount: "oops" }],
    treasuryTransactions: [],
    rewardRecipients: [],
  });
  assert.equal(summary.payments.count, 1);
  assert.equal(summary.volume, 0n);
});
