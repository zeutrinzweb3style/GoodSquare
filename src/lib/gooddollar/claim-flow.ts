/**
 * Pure state machine for the GoodDollar "double claim" modal.
 *
 * The SDK's `claim(onConfirmFaucetTx, onClaimSubmitted)` may require the user to
 * sign up to two mainnet transactions: a faucet top-up for gas, then the claim
 * itself. `onConfirmFaucetTx` is the only pre-flight consent gate and always
 * fires once; `onClaimSubmitted` fires after the claim is broadcast.
 *
 * This module holds the phases, transitions, and derived copy only — no SDK and
 * no React — so `tests/claim-flow.test.ts` can exercise it directly.
 */

import type { ClaimStatus } from "./config";

export type ClaimFlowPhase =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "preparing" }
  | { kind: "confirming"; message: string }
  | { kind: "submitting"; hash: string }
  | { kind: "success"; hash: string }
  | { kind: "declined" }
  | { kind: "failed"; message: string; hash?: string };

export type ClaimFlowEvent =
  | { type: "start" }
  | { type: "verify-started" }
  | { type: "verify-finished" }
  | { type: "confirm-required"; message: string }
  | { type: "confirm-accepted" }
  | { type: "confirm-declined" }
  | { type: "submitted"; hash: string }
  | { type: "succeeded"; hash: string }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const initialClaimFlow: ClaimFlowPhase = { kind: "idle" };

/**
 * Advances the claim flow. Transitions that do not match the current phase are
 * ignored, so a late or duplicated SDK callback can never corrupt the state.
 */
export function claimFlowReducer(
  phase: ClaimFlowPhase,
  event: ClaimFlowEvent,
): ClaimFlowPhase {
  switch (event.type) {
    case "reset":
      return { kind: "idle" };
    case "start":
      return { kind: "preparing" };
    case "verify-started":
      if (phase.kind !== "idle") return phase;
      return { kind: "verifying" };
    case "verify-finished":
      // Verification completes (or is abandoned); the caller re-checks the
      // wallet status, so returning to idle lets the status drive the screen.
      if (phase.kind !== "verifying") return phase;
      return { kind: "idle" };
    case "confirm-required":
      if (phase.kind !== "preparing") return phase;
      return { kind: "confirming", message: event.message };
    case "confirm-accepted":
      if (phase.kind !== "confirming") return phase;
      return { kind: "preparing" };
    case "confirm-declined":
      if (phase.kind !== "confirming") return phase;
      return { kind: "declined" };
    case "submitted":
      if (phase.kind !== "preparing") return phase;
      return { kind: "submitting", hash: event.hash };
    case "succeeded":
      if (phase.kind !== "submitting" && phase.kind !== "preparing") return phase;
      return { kind: "success", hash: event.hash };
    case "failed":
      // A declined or successful claim is terminal; ignore late errors.
      if (phase.kind === "declined" || phase.kind === "success") return phase;
      // Keep a broadcast hash so the error screen can still link to the top-up.
      return {
        kind: "failed",
        message: event.message,
        ...(phase.kind === "submitting" ? { hash: phase.hash } : {}),
      };
  }
}

/** The screens the modal can render. */
export type ClaimViewKind =
  | "wrong_chain"
  | "not_verified"
  | "already_claimed"
  | "intro"
  | "verifying"
  | "confirming"
  | "preparing"
  | "submitting"
  | "success"
  | "declined"
  | "failed";

/**
 * Chooses which screen to show. An in-flight flow always wins; otherwise the
 * screen follows the wallet's claim status.
 */
export function resolveClaimView(input: {
  status: ClaimStatus | null;
  chainSupported: boolean;
  phase: ClaimFlowPhase;
}): ClaimViewKind {
  const { status, chainSupported, phase } = input;

  switch (phase.kind) {
    case "verifying":
      return "verifying";
    case "confirming":
      return "confirming";
    case "preparing":
      return "preparing";
    case "submitting":
      return "submitting";
    case "success":
      return "success";
    case "declined":
      return "declined";
    case "failed":
      return "failed";
    case "idle":
      break;
  }

  if (!chainSupported) return "wrong_chain";
  if (status === "not_whitelisted") return "not_verified";
  if (status === "already_claimed") return "already_claimed";
  return "intro";
}

export interface ClaimStep {
  /** 1-based index of the current signature. */
  step: number;
  /** Upper bound on the number of signatures, which is 2. */
  total: number;
  label: string;
}

/**
 * Step indicator for the two-signature flow. Returns null for screens that are
 * not part of an in-flight claim.
 */
export function claimStepInfo(kind: ClaimViewKind): ClaimStep | null {
  switch (kind) {
    case "confirming":
      return { step: 1, total: 2, label: "Confirm top-up" };
    case "preparing":
      return { step: 1, total: 2, label: "Preparing claim" };
    case "submitting":
      return { step: 2, total: 2, label: "Claiming" };
    case "success":
      return { step: 2, total: 2, label: "Done" };
    default:
      return null;
  }
}

/** Formats a millisecond duration as HH:MM:SS, clamped at zero. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Milliseconds until `target`, or 0 when the target is missing or past. */
export function msUntil(target: Date | number | null | undefined, now: number): number {
  if (target == null) return 0;
  const time = target instanceof Date ? target.getTime() : target;
  return Math.max(0, time - now);
}
