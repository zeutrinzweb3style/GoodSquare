import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  formatAmount,
  isPositiveAmount,
  exceedsBalance,
} from "../src/lib/treasury/amounts.ts";
import {
  getToken,
  isPayable,
  payableTokens,
  tokenDecimals,
  isNativeToken,
  chainSupportsTokens,
  SUPPORTED_CHAIN_IDS,
  listTokens,
} from "../src/lib/treasury/tokens.ts";
import {
  decodeTransferLog,
  findMatchingErc20Transfer,
  matchesTransfer,
  TRANSFER_TOPIC,
} from "../src/lib/treasury/verification.ts";
import {
  canExecute,
  canTransition,
  isTerminal,
} from "../src/lib/treasury/spending.ts";
import {
  canCancelRequest,
  canFulfillRequest,
  isFinalPaymentStatus,
} from "../src/lib/pay/status.ts";

const MAINNET = 42220;
const SEPOLIA = 11142220;

// --- amounts -----------------------------------------------------------------

test("parseAmount converts a whole number to base units", () => {
  assert.equal(parseAmount("5", 18), 5n * 10n ** 18n);
  assert.equal(parseAmount("5", 6), 5_000_000n);
});

test("parseAmount converts a decimal to base units", () => {
  assert.equal(parseAmount("1.5", 6), 1_500_000n);
  assert.equal(parseAmount("0.000001", 6), 1n);
  assert.equal(parseAmount("1.000000000000000001", 18), 1n * 10n ** 18n + 1n);
});

test("parseAmount rejects over-precise, malformed, and empty input", () => {
  assert.equal(parseAmount("1.0000001", 6), null);
  assert.equal(parseAmount("1.", 6), null);
  assert.equal(parseAmount(".5", 6), null);
  assert.equal(parseAmount("", 6), null);
  assert.equal(parseAmount("abc", 6), null);
  assert.equal(parseAmount("-1", 6), null);
});

test("formatAmount is the inverse of parseAmount", () => {
  for (const value of ["1", "1.5", "0.000001", "1234.5678"]) {
    const units = parseAmount(value, 6)!;
    assert.equal(formatAmount(units, 6), value);
  }
});

test("formatAmount trims trailing zeros and handles whole numbers", () => {
  assert.equal(formatAmount(1_500_000n, 6), "1.5");
  assert.equal(formatAmount(1_000_000n, 6), "1");
  assert.equal(formatAmount(0n, 6), "0");
});

test("isPositiveAmount and exceedsBalance guard spends", () => {
  assert.equal(isPositiveAmount(1n), true);
  assert.equal(isPositiveAmount(0n), false);
  assert.equal(exceedsBalance(100n, 50n), true);
  assert.equal(exceedsBalance(50n, 50n), false);
  assert.equal(exceedsBalance(50n, null), false);
});

// --- tokens ------------------------------------------------------------------

test("supported chains are mainnet and Celo Sepolia", () => {
  assert.deepEqual(SUPPORTED_CHAIN_IDS.sort((a, b) => a - b), [
    MAINNET,
    SEPOLIA,
  ]);
  assert.equal(chainSupportsTokens(MAINNET), true);
  assert.equal(chainSupportsTokens(1), false);
  assert.equal(chainSupportsTokens(null), false);
});

test("the registry pins verified addresses and decimals", () => {
  assert.equal(
    getToken(MAINNET, "USDC")?.contract,
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  );
  assert.equal(tokenDecimals(MAINNET, "USDC"), 6);
  assert.equal(tokenDecimals(MAINNET, "cUSD"), 18);
  assert.equal(tokenDecimals(MAINNET, "CELO"), 18);
});

test("native CELO has no contract and is payable", () => {
  const celo = getToken(MAINNET, "CELO")!;
  assert.equal(celo.native, true);
  assert.equal(celo.contract, null);
  assert.equal(isNativeToken(MAINNET, "CELO"), true);
  assert.equal(isPayable(MAINNET, "CELO"), true);
});

test("a token with no contract on a chain is not payable", () => {
  // USDT is not deployed on Celo Sepolia in the registry.
  assert.equal(getToken(SEPOLIA, "USDT")?.contract, null);
  assert.equal(isPayable(SEPOLIA, "USDT"), false);
  assert.equal(isPayable(MAINNET, "USDT"), true);
});

test("unknown tokens and chains are rejected", () => {
  assert.equal(getToken(MAINNET, "DAI"), null);
  assert.equal(getToken(MAINNET, null), null);
  assert.equal(getToken(1, "USDC"), null);
  assert.equal(isPayable(MAINNET, "DAI"), false);
  assert.equal(tokenDecimals(MAINNET, "DAI"), null);
});

test("payableTokens excludes undeployed tokens and keeps native first", () => {
  const sepolia = payableTokens(SEPOLIA);
  assert.ok(sepolia.every((token) => token.native || token.contract));
  assert.equal(sepolia.some((token) => token.id === "USDT"), false);
  assert.equal(listTokens(SEPOLIA).length, 5);
});

test("G$ is payable on mainnet and absent on Sepolia", () => {
  const gdollar = getToken(MAINNET, "G$")!;
  assert.equal(gdollar.contract, "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");
  assert.equal(gdollar.decimals, 18);
  assert.equal(gdollar.native, false);
  assert.equal(isPayable(MAINNET, "G$"), true);
  assert.ok(payableTokens(MAINNET).some((token) => token.id === "G$"));

  // GoodDollar has no Celo Sepolia deployment.
  assert.equal(getToken(SEPOLIA, "G$")?.contract, null);
  assert.equal(isPayable(SEPOLIA, "G$"), false);
  assert.equal(payableTokens(SEPOLIA).some((token) => token.id === "G$"), false);
});

// --- verification ------------------------------------------------------------

const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const SENDER = "0x52908400098527886e0f7030069857d2e4169ee7";
const RECIPIENT = "0x1111111111111111111111111111111111111111";

function transferLog({
  contract = USDC,
  from = SENDER,
  to = RECIPIENT,
  amount = 1_000_000n,
} = {}) {
  return {
    address: contract,
    topics: [
      TRANSFER_TOPIC,
      `0x${"0".repeat(24)}${from.slice(2)}`,
      `0x${"0".repeat(24)}${to.slice(2)}`,
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  };
}

test("decodeTransferLog decodes an ERC-20 Transfer event", () => {
  const decoded = decodeTransferLog(transferLog({ amount: 42n }));
  assert.equal(decoded?.contract, USDC.toLowerCase());
  assert.equal(decoded?.from, SENDER);
  assert.equal(decoded?.to, RECIPIENT);
  assert.equal(decoded?.amount, 42n);
});

test("decodeTransferLog ignores unrelated logs", () => {
  const log = transferLog();
  log.topics[0] = "0x" + "ab".repeat(32);
  assert.equal(decodeTransferLog(log), null);
  assert.equal(decodeTransferLog({ ...log, topics: [TRANSFER_TOPIC] }), null);
});

test("matchesTransfer compares addresses case-insensitively and exact amounts", () => {
  const expectation = {
    from: SENDER.toUpperCase(),
    to: RECIPIENT,
    amount: 1_000_000n,
  };
  assert.equal(
    matchesTransfer(expectation, {
      from: SENDER,
      to: RECIPIENT,
      amount: 1_000_000n,
    }).ok,
    true,
  );
  assert.equal(
    matchesTransfer(expectation, {
      from: RECIPIENT,
      to: RECIPIENT,
      amount: 1_000_000n,
    }).ok,
    false,
  );
  assert.equal(
    matchesTransfer(expectation, {
      from: SENDER,
      to: SENDER,
      amount: 1_000_000n,
    }).ok,
    false,
  );
  assert.equal(
    matchesTransfer(expectation, {
      from: SENDER,
      to: RECIPIENT,
      amount: 999_999n,
    }).ok,
    false,
  );
});

test("findMatchingErc20Transfer requires the right token, addresses, and amount", () => {
  const expectation = {
    from: SENDER,
    to: RECIPIENT,
    amount: 1_000_000n,
  };

  assert.ok(findMatchingErc20Transfer(USDC, expectation, [transferLog()]));

  // Wrong token contract: a spoofed token must not satisfy a USDC expectation.
  assert.equal(
    findMatchingErc20Transfer(USDC, expectation, [
      transferLog({ contract: "0x2222222222222222222222222222222222222222" }),
    ]),
    null,
  );

  // Wrong amount.
  assert.equal(
    findMatchingErc20Transfer(USDC, expectation, [transferLog({ amount: 1n })]),
    null,
  );

  // Wrong sender.
  assert.equal(
    findMatchingErc20Transfer(USDC, expectation, [
      transferLog({ from: RECIPIENT }),
    ]),
    null,
  );
});

// --- spending ----------------------------------------------------------------

test("spending proposals follow the allowed transitions", () => {
  assert.equal(canTransition("pending", "approved"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  assert.equal(canTransition("pending", "cancelled"), true);
  assert.equal(canTransition("approved", "executed"), true);
  assert.equal(canTransition("approved", "cancelled"), true);
  assert.equal(canTransition("pending", "executed"), false);
  assert.equal(canTransition("rejected", "approved"), false);
  assert.equal(canTransition("executed", "cancelled"), false);
});

test("terminal statuses never transition", () => {
  assert.equal(isTerminal("executed"), true);
  assert.equal(isTerminal("rejected"), true);
  assert.equal(isTerminal("cancelled"), true);
  assert.equal(isTerminal("pending"), false);
  assert.equal(isTerminal("approved"), false);
});

test("canExecute enforces approval, active treasury, and balance", () => {
  const base = {
    treasuryActive: true,
    balance: 1_000n,
    amount: 500n,
    governancePassed: null as boolean | null,
  };

  assert.equal(canExecute("approved", base).ok, true);
  assert.equal(canExecute("pending", base).ok, false);
  assert.equal(canExecute("approved", { ...base, treasuryActive: false }).ok, false);
  assert.equal(canExecute("approved", { ...base, amount: 0n }).ok, false);
  assert.equal(canExecute("approved", { ...base, amount: 1_001n }).ok, false);
  assert.equal(
    canExecute("approved", { ...base, governancePassed: false }).ok,
    false,
  );
  assert.equal(
    canExecute("approved", { ...base, governancePassed: true }).ok,
    true,
  );
  // Unknown balance (null) does not block execution.
  assert.equal(canExecute("approved", { ...base, balance: null }).ok, true);
});

// --- pay status --------------------------------------------------------------

test("only open requests can be fulfilled or cancelled", () => {
  assert.equal(canFulfillRequest("open"), true);
  assert.equal(canFulfillRequest("paid"), false);
  assert.equal(canFulfillRequest("cancelled"), false);
  assert.equal(canCancelRequest("open"), true);
  assert.equal(canCancelRequest("paid"), false);
});

test("verified payments are final", () => {
  assert.equal(isFinalPaymentStatus("verified"), true);
  assert.equal(isFinalPaymentStatus("pending"), false);
  assert.equal(isFinalPaymentStatus("failed"), false);
});
