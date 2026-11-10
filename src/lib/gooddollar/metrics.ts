/**
 * Pure G$ activity metrics for the community dashboard.
 *
 * GoodBuilders asks teams to report "users, transactions and G$ activity the
 * same way" and to set goals as numbers. This module reduces already-fetched
 * rows into those numbers so the shape is unit tested and the numbers on the
 * dashboard and the API can never drift apart.
 *
 * Amounts arrive as base-unit decimal strings. Only G$ rows are counted, so
 * every amount shares one scale (18 decimals) and can be summed exactly.
 */

/**
 * G$'s symbol in the token registry. Inlined (rather than imported from
 * `./config`) so this module stays self-contained and can be unit tested by the
 * Node test runner, which does not resolve extensionless relative imports.
 */
const G_DOLLAR_TOKEN_ID = "G$";

export interface PaymentRow {
  payer: string;
  payee: string;
  tokenSymbol: string;
  /** Base units. */
  amount: string;
}

export interface TreasuryTransactionRow {
  direction: "in" | "out";
  tokenSymbol: string;
  /** Base units. */
  amount: string;
  from: string;
  to: string;
}

export interface RewardRecipientRow {
  address: string;
  status: "pending" | "paid" | "skipped";
  tokenSymbol: string;
  /** Base units. */
  amount: string;
}

export interface GdollarActivityInput {
  payments: PaymentRow[];
  treasuryTransactions: TreasuryTransactionRow[];
  rewardRecipients: RewardRecipientRow[];
}

export interface GdollarActivitySummary {
  /** Total G$ moved for utility: payments plus paid rewards, in base units. */
  volume: bigint;
  /** Number of settled G$ events counted in `volume`. */
  transactions: number;
  /** Distinct wallets that sent, received or earned G$ in these rows. */
  uniqueWallets: number;
  payments: { count: number; volume: bigint };
  rewards: { paidCount: number; paidVolume: bigint };
  treasury: { inVolume: bigint; outVolume: bigint };
}

function isGdollar(symbol: string): boolean {
  return symbol === G_DOLLAR_TOKEN_ID;
}

function baseUnits(amount: string): bigint {
  try {
    return BigInt(amount);
  } catch {
    return 0n;
  }
}

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Reduce raw payment, treasury and reward rows into the G$ activity summary.
 * Rows in any other token are ignored, so the dashboard only ever reports G$.
 */
export function summarizeGdollarActivity(
  input: GdollarActivityInput,
): GdollarActivitySummary {
  const wallets = new Set<string>();

  let paymentCount = 0;
  let paymentVolume = 0n;
  for (const payment of input.payments) {
    if (!isGdollar(payment.tokenSymbol)) continue;
    paymentCount += 1;
    paymentVolume += baseUnits(payment.amount);
    wallets.add(normalize(payment.payer));
    wallets.add(normalize(payment.payee));
  }

  let paidCount = 0;
  let paidVolume = 0n;
  for (const recipient of input.rewardRecipients) {
    if (!isGdollar(recipient.tokenSymbol)) continue;
    if (recipient.status !== "paid") continue;
    paidCount += 1;
    paidVolume += baseUnits(recipient.amount);
    wallets.add(normalize(recipient.address));
  }

  let treasuryIn = 0n;
  let treasuryOut = 0n;
  for (const tx of input.treasuryTransactions) {
    if (!isGdollar(tx.tokenSymbol)) continue;
    if (tx.direction === "in") {
      treasuryIn += baseUnits(tx.amount);
    } else {
      treasuryOut += baseUnits(tx.amount);
    }
    wallets.add(normalize(tx.from));
    wallets.add(normalize(tx.to));
  }

  return {
    volume: paymentVolume + paidVolume,
    transactions: paymentCount + paidCount,
    uniqueWallets: wallets.size,
    payments: { count: paymentCount, volume: paymentVolume },
    rewards: { paidCount, paidVolume },
    treasury: { inVolume: treasuryIn, outVolume: treasuryOut },
  };
}
