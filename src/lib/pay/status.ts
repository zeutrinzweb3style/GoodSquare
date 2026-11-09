/**
 * Square Pay state rules.
 *
 * Payment requests are created by a payee (a community or a wallet) and
 * fulfilled by a payer who sends the token directly, wallet to wallet. Good
 * Square never holds or forwards the funds; it records and verifies the
 * transfer. Payments are immutable once verified.
 */

export type PaymentRequestStatus = "open" | "paid" | "cancelled";
export type PaymentStatus = "pending" | "verified" | "failed";

export function canFulfillRequest(status: PaymentRequestStatus): boolean {
  return status === "open";
}

export function canCancelRequest(status: PaymentRequestStatus): boolean {
  return status === "open";
}

/** A payment record is final once verified; failed records may be retried. */
export function isFinalPaymentStatus(status: PaymentStatus): boolean {
  return status === "verified";
}
