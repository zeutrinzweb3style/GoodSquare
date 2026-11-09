/**
 * Decimal <-> base-unit helpers for token amounts.
 *
 * All amounts cross the API and the database as decimal strings in base units
 * (wei-style integers), never as floats, so no precision is ever lost. These
 * helpers are pure so they can be unit tested without a network.
 */

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * Parse a human decimal string (e.g. "1.5") into base units for a token with
 * `decimals` places. Returns null when the input is not a positive decimal or
 * carries more precision than the token supports.
 */
export function parseAmount(
  input: string,
  decimals: number,
): bigint | null {
  const value = input.trim();
  if (!DECIMAL_RE.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;

  const padded = fraction.padEnd(decimals, "0");
  try {
    return BigInt(`${whole}${padded}`);
  } catch {
    return null;
  }
}

/** Format base units back into a trimmed human decimal string. */
export function formatAmount(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = abs % divisor;

  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

export function isPositiveAmount(units: bigint): boolean {
  return units > 0n;
}

/** Whether a requested amount is within a known balance. */
export function exceedsBalance(
  units: bigint,
  balance: bigint | null | undefined,
): boolean {
  if (balance == null) return false;
  return units > balance;
}
