/**
 * Pure GoodDollar citizenship checks for the "verified humans only" gate.
 *
 * Kept free of SDK and network imports so it can be unit tested and imported
 * from anywhere. The network-facing wrapper lives in `identity.ts`.
 *
 * The gate is opt-in per community and per quest. When it is on, only wallets
 * the GoodDollar identity registry recognises as verified citizens may join the
 * community or submit a quest — which is one of the six meaningful G$
 * integrations GoodBuilders accepts.
 */

/** The subset of `IdentityStatus` the gate needs. */
export interface CitizenshipInput {
  isWhitelisted: boolean;
  /** Unix seconds of the last successful face verification, if known. */
  lastAuthenticated: number | null;
  /** Verification validity period in seconds, if known. */
  authenticationPeriod: number | null;
}

export interface CitizenshipResult {
  verified: boolean;
  reason?: string;
}

/**
 * Whether the identity status means a currently verified human.
 *
 * A wallet is verified when it resolves to a non-zero root identity and its
 * last face verification is still within the contract's authentication period.
 * When the period is unknown we accept the whitelist flag alone, matching how
 * the GoodDollar claim flow treats a whitelisted citizen.
 */
export function evaluateCitizenship(
  status: CitizenshipInput | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): CitizenshipResult {
  if (!status) {
    return {
      verified: false,
      reason: "Could not read your GoodDollar identity. Try again shortly.",
    };
  }
  if (!status.isWhitelisted) {
    return {
      verified: false,
      reason: "Verify your GoodDollar identity to continue.",
    };
  }
  if (
    status.lastAuthenticated != null &&
    status.authenticationPeriod != null &&
    status.authenticationPeriod > 0 &&
    nowSeconds > status.lastAuthenticated + status.authenticationPeriod
  ) {
    return {
      verified: false,
      reason:
        "Your GoodDollar verification has expired. Re-verify to continue.",
    };
  }
  return { verified: true };
}
