"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { useIdentitySDK } from "@goodsdks/react-hooks";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn, shortenAddress } from "@/lib/utils";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  celoTxUrl,
  formatUnits,
} from "@/lib/gooddollar/config";
import type { ClaimStatus } from "@/lib/gooddollar/config";
import {
  claimFlowReducer,
  claimStepInfo,
  formatCountdown,
  initialClaimFlow,
  msUntil,
  resolveClaimView,
} from "@/lib/gooddollar/claim-flow";
import type { ClaimViewKind } from "@/lib/gooddollar/claim-flow";
import { runInAppVerification, openVerificationPopup } from "@/lib/gooddollar/verify-session";

/**
 * Hooks the modal hands to the SDK claim runner. The runner must call
 * `confirmFaucet` (and await it) before any top-up, and `onSubmitted` once the
 * claim transaction is broadcast.
 */
export interface ClaimRunHandlers {
  /** Ask the user to approve the (possible) top-up. Rejects if they decline. */
  confirmFaucet: (message: string) => Promise<void>;
  onSubmitted: (hash: string) => void;
}

/** Thrown internally when the user declines the faucet prompt. */
class ClaimDeclined extends Error {
  constructor() {
    super("declined");
    this.name = "ClaimDeclined";
  }
}

export interface ClaimModalProps {
  open: boolean;
  onClose: () => void;
  status: ClaimStatus;
  entitlement: bigint;
  nextClaimTime?: Date;
  address: string;
  chainSupported: boolean;
  switchingChain: boolean;
  onSwitchChain: () => void;
  /** Drives the SDK claim; must invoke the handlers it is given. */
  runClaim: (handlers: ClaimRunHandlers) => Promise<string>;
  /** Called once a claim is confirmed so the parent can refresh its status. */
  onClaimed: () => void;
  /** Called after the in-app verification popup returns, so the parent refreshes. */
  onVerified: () => void;
}

export function ClaimModal({
  open,
  onClose,
  status,
  entitlement,
  nextClaimTime,
  address,
  chainSupported,
  switchingChain,
  onSwitchChain,
  runClaim,
  onClaimed,
  onVerified,
}: ClaimModalProps) {
  const [phase, dispatch] = useReducer(claimFlowReducer, initialClaimFlow);
  const confirmResolver = useRef<((accepted: boolean) => void) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { sdk: identitySdk } = useIdentitySDK(GOODDOLLAR_ENV);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const view = resolveClaimView({ status, chainSupported, phase });
  const step = claimStepInfo(view);

  // Reset the flow whenever the modal closes so the next open starts clean.
  useEffect(() => {
    if (!open) dispatch({ type: "reset" });
  }, [open]);

  // Tick the countdown only while it is visible.
  useEffect(() => {
    if (!open || view !== "already_claimed") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, view]);

  function respondConfirm(accepted: boolean) {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    resolve?.(accepted);
  }

  /**
   * Closing must respect an in-flight claim. While a transaction is being
   * prepared or confirmed we ignore close requests, and while we are waiting on
   * the user's faucet decision we treat the close as a decline so the pending
   * promise never dangles. The verification popup runs outside the modal, so it
   * may be closed.
   */
  function handleClose() {
    if (view === "preparing" || view === "submitting") return;
    if (view === "confirming") respondConfirm(false);
    onClose();
  }

  /**
   * Runs GoodID face verification in an in-app popup so the page never
   * navigates away. When the popup returns we re-read the wallet identity; a
   * successful verification flips the status to `can_claim`.
   */
  async function startVerification() {
    if (!identitySdk) return;
    // Open the popup synchronously, inside the click handler, so the browser
    // treats it as user-initiated and does not block it.
    const popup = openVerificationPopup();
    setVerifyError(null);
    setVerifyBusy(true);
    dispatch({ type: "verify-started" });
    try {
      const outcome = await runInAppVerification({
        popup,
        generateLink: (popupMode, callbackUrl, chainId) =>
          identitySdk.generateFVLink(popupMode, callbackUrl, chainId),
        chainId: GOODDOLLAR_CELO_CHAIN_ID,
      });
      if (outcome === "blocked") {
        setVerifyError(
          "Your browser blocked the verification window. Allow pop-ups for this site and try again.",
        );
      }
    } catch (err) {
      setVerifyError(
        err instanceof Error ? err.message : "Could not start verification",
      );
    } finally {
      setVerifyBusy(false);
      dispatch({ type: "verify-finished" });
      onVerified();
    }
  }

  async function startClaim() {
    dispatch({ type: "start" });
    try {
      const hash = await runClaim({
        confirmFaucet: async (message) => {
          dispatch({ type: "confirm-required", message });
          const accepted = await new Promise<boolean>((resolve) => {
            confirmResolver.current = resolve;
          });
          if (!accepted) {
            dispatch({ type: "confirm-declined" });
            throw new ClaimDeclined();
          }
          dispatch({ type: "confirm-accepted" });
        },
        onSubmitted: (txHash) => dispatch({ type: "submitted", hash: txHash }),
      });
      dispatch({ type: "succeeded", hash });
      onClaimed();
    } catch (error) {
      if (error instanceof ClaimDeclined) return;
      dispatch({
        type: "failed",
        message: error instanceof Error ? error.message : "Claim failed",
      });
    }
  }

  function retry() {
    dispatch({ type: "reset" });
    void startClaim();
  }

  const amount = `${formatUnits(entitlement)} G$`;
  const remaining = msUntil(nextClaimTime, now);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={view !== "preparing" && view !== "submitting"}
      labelledBy="gd-claim-title"
      className="max-h-[calc(100dvh-2rem)] max-w-[430px] overflow-y-auto"
    >
      <Hero view={view} step={step} />

      <div className="flex items-start gap-3 px-5 pb-3">
        <span
          className={cn(
            "relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border",
            view === "success" &&
              "border-primary/40 bg-accent text-accent-foreground gs-pop",
            (view === "failed" || view === "declined") &&
              "border-destructive/30 bg-destructive/10 text-destructive",
            (view === "confirming" ||
              view === "wrong_chain" ||
              view === "not_verified") &&
              "border-border bg-muted text-foreground",
            (view === "intro" ||
              view === "preparing" ||
              view === "submitting") &&
              "border-primary/30 bg-accent text-accent-foreground",
            view === "verifying" && "border-primary/30 bg-muted text-foreground",
            view === "already_claimed" &&
              "border-border bg-muted text-muted-foreground",
          )}
        >
          {(view === "intro" ||
            view === "preparing" ||
            view === "submitting" ||
            view === "success") && (
            <span className="gs-ring absolute inset-0 rounded-2xl border border-primary/40" />
          )}
          <HeaderIcon view={view} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="gd-claim-title" className="text-base font-semibold tracking-tight">
            {titleFor(view)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitleFor(view)}</p>
        </div>
        {view !== "preparing" && view !== "submitting" ? (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <XCircle className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-5 pb-1">
        <Body
          view={view}
          amount={amount}
          entitlement={entitlement}
          address={address}
          phase={phase}
          remaining={remaining}
          verifyError={verifyError}
        />
      </div>

      <div className="flex gap-2.5 p-5 pt-3">
        <Footer
          view={view}
          amount={amount}
          switchingChain={switchingChain}
          onClose={onClose}
          onStartClaim={startClaim}
          onRetry={retry}
          onSwitchChain={onSwitchChain}
          onConfirm={() => respondConfirm(true)}
          onDecline={() => respondConfirm(false)}
          onVerify={() => void startVerification()}
          verifyBusy={verifyBusy}
        />
      </div>
    </Dialog>
  );
}

/** Decorative top band: brand wash, floating glow, and the step progress. */
function Hero({
  view,
  step,
}: {
  view: ClaimViewKind;
  step: ReturnType<typeof claimStepInfo>;
}) {
  const celebrating = view === "success";
  return (
    <div className="relative h-24 overflow-hidden">
      <div className="absolute inset-0 gs-surface" />
      <div className="gs-float absolute -right-8 -top-12 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-gold/20 blur-3xl" />
      {celebrating ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center gap-4">
          {[0, 0.25, 0.5].map((delay) => (
            <span
              key={delay}
              className="gs-coin text-lg"
              style={{ animationDelay: `${delay}s` }}
            >
              🪙
            </span>
          ))}
        </div>
      ) : null}
      <div className="gs-hairline absolute inset-x-0 bottom-0 h-px" />
      {step ? (
        <div className="absolute inset-x-5 bottom-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>
              Step {step.step} of {step.total}
            </span>
            <span>{step.label}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: step.total }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              >
                {i <= step.step - 1 ? (
                  <span
                    key={`${step.step}-${i}`}
                    className="gs-progress gs-brand-gradient block h-full rounded-full"
                  />
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-5 bottom-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          GoodDollar UBI · Celo mainnet
        </div>
      )}
    </div>
  );
}

function HeaderIcon({ view }: { view: ClaimViewKind }) {
  switch (view) {
    case "success":
      return <CheckCircle2 className="h-5 w-5" />;
    case "failed":
    case "declined":
      return <XCircle className="h-5 w-5" />;
    case "confirming":
    case "wrong_chain":
    case "not_verified":
      return <AlertTriangle className="h-5 w-5" />;
    case "already_claimed":
      return <Clock className="h-5 w-5" />;
    case "verifying":
      return <ShieldCheck className="h-5 w-5" />;
    case "preparing":
    case "submitting":
      return <Loader2 className="h-5 w-5 animate-spin" />;
    default:
      return <ShieldCheck className="h-5 w-5" />;
  }
}

function titleFor(view: ClaimViewKind): string {
  switch (view) {
    case "intro":
      return "Claim your daily G$";
    case "verifying":
      return "Proving you're human";
    case "confirming":
      return "One signature to go";
    case "preparing":
      return "Preparing your claim";
    case "submitting":
      return "Sending your G$";
    case "success":
      return "G$ claimed";
    case "declined":
      return "Top-up cancelled";
    case "failed":
      return "Claim didn't land";
    case "already_claimed":
      return "Already claimed today";
    case "not_verified":
      return "Verify to unlock G$";
    case "wrong_chain":
      return "Switch to Celo";
  }
}

function subtitleFor(view: ClaimViewKind): string {
  switch (view) {
    case "intro":
      return "Free daily UBI, straight to your wallet.";
    case "verifying":
      return "Finish the face check in the GoodID window.";
    case "confirming":
      return "Approve in your wallet and the claim runs itself.";
    case "preparing":
      return "Open your wallet to approve the next step.";
    case "submitting":
      return "Broadcast. Waiting for Celo to confirm.";
    case "success":
      return "Your G$ is on its way on-chain.";
    case "declined":
      return "Nothing claimed, nothing charged.";
    case "failed":
      return "Safe to try again — no funds moved.";
    case "already_claimed":
      return "UBI resets daily. Come back tomorrow.";
    case "not_verified":
      return "GoodDollar citizens only. One-time face check.";
    case "wrong_chain":
      return "GoodDollar lives on Celo mainnet only — no testnet.";
  }
}

function Body({
  view,
  amount,
  entitlement,
  address,
  phase,
  remaining,
  verifyError,
}: {
  view: ClaimViewKind;
  amount: string;
  entitlement: bigint;
  address: string;
  phase: ReturnType<typeof claimFlowReducer>;
  remaining: number;
  verifyError: string | null;
}) {
  switch (view) {
    case "intro":
      return (
        <>
          <div className="gs-rise relative overflow-hidden rounded-2xl border border-gold/30 bg-gold-soft/60 px-4 py-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-foreground/80">
              Available to claim now
            </p>
            <p className="gs-sheen-text mt-1 text-4xl font-bold tracking-tight tabular-nums">
              {formatUnits(entitlement)}
            </p>
            <p className="mt-1 text-sm font-medium text-gold-foreground">
              G$ per day, every day
            </p>
          </div>
          <KeyValue
            rows={[
              ["Wallet", <span key="w" className="font-mono">{shortenAddress(address, 6)}</span>],
              ["Identity", "Verified citizen"],
              ["Network", `Celo · ${GOODDOLLAR_CELO_CHAIN_ID}`],
            ]}
          />
          <Note tone="ok">
            Claimed straight to your wallet. Good Square never holds your funds.
          </Note>
        </>
      );

    case "confirming":
      return (
        <>
          <Note tone="warn">
            {(phase.kind === "confirming" ? phase.message : "") ||
              "GoodDollar may need a small top-up first if your wallet is low on gas for the claim."}
          </Note>
          <KeyValue
            rows={[
              ["Transaction", "Top-up (if needed) then claim"],
              ["Signer", "Your wallet"],
            ]}
          />
        </>
      );

    case "preparing":
      return (
        <Note>
          Waiting for your wallet to sign… This usually takes a few seconds.
        </Note>
      );

    case "submitting":
      return (
        <>
          {phase.kind === "submitting" ? (
            <TxLink hash={phase.hash} label="Claim transaction" />
          ) : null}
          <Note>Your wallet signed it. Confirming on Celo now — please wait.</Note>
        </>
      );

    case "success":
      return (
        <>
          <div className="gs-rise relative overflow-hidden rounded-2xl border border-primary/30 bg-accent px-4 py-6 text-center">
            <p className="gs-pop text-4xl font-bold tracking-tight tabular-nums">
              +{amount}
            </p>
            <p className="mt-1 text-sm text-accent-foreground/80">
              Next claim opens in {formatCountdown(remaining)}
            </p>
          </div>
          {phase.kind === "success" ? <TxLink hash={phase.hash} label="Claim transaction" /> : null}
        </>
      );

    case "declined":
      return (
        <Note tone="bad">
          You declined the top-up, so the claim did not run. Try again, or add a
          little G$ or CELO for gas yourself and skip the top-up.
        </Note>
      );

    case "failed":
      return (
        <>
          <Note tone="bad">
            {phase.kind === "failed"
              ? phase.message
              : "The claim could not be completed."}
          </Note>
          {phase.kind === "failed" && phase.hash ? (
            <TxLink hash={phase.hash} label="Top-up transaction" />
          ) : null}
        </>
      );

    case "already_claimed":
      return (
        <>
          <div className="rounded-2xl border border-border bg-muted/60 px-4 py-6 text-center">
            <p className="text-4xl font-bold tracking-tight tabular-nums">
              {formatCountdown(remaining)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Time until your next claim
            </p>
          </div>
        </>
      );

    case "verifying":
      return (
        <>
          <Note tone="warn">
            Finish the face check in the GoodID window. This page stays open and
            updates the moment you are done.
          </Note>
          {verifyError ? <Note tone="bad">{verifyError}</Note> : null}
        </>
      );

    case "not_verified":
      return (
        <>
          <Note tone="warn">
            Verification is a one-time face check on GoodDollar. It stays on
            GoodDollar — Good Square never sees it.
          </Note>
          <KeyValue rows={[["Status", "Not verified"]]} />
          {verifyError ? <Note tone="bad">{verifyError}</Note> : null}
        </>
      );

    case "wrong_chain":
      return (
        <KeyValue
          rows={[
            ["Your network", "Not Celo mainnet"],
            ["Required", `Celo · ${GOODDOLLAR_CELO_CHAIN_ID}`],
          ]}
        />
      );
  }
}

function Footer({
  view,
  amount,
  switchingChain,
  onClose,
  onStartClaim,
  onRetry,
  onSwitchChain,
  onConfirm,
  onDecline,
  onVerify,
  verifyBusy,
}: {
  view: ClaimViewKind;
  amount: string;
  switchingChain: boolean;
  onClose: () => void;
  onStartClaim: () => void;
  onRetry: () => void;
  onSwitchChain: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  onVerify: () => void;
  verifyBusy: boolean;
}) {
  switch (view) {
    case "intro":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Not now
          </Button>
          <Button
            className="gs-brand-gradient flex-1 text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            onClick={onStartClaim}
          >
            Claim {amount}
          </Button>
        </>
      );

    case "confirming":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onDecline}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      );

    case "preparing":
      return (
        <>
          <Button variant="outline" className="flex-1" disabled>
            Cancel
          </Button>
          <Button className="flex-1" disabled>
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting…
          </Button>
        </>
      );

    case "submitting":
      return (
        <Button className="flex-1" disabled>
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
        </Button>
      );

    case "success":
      return (
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      );

    case "declined":
    case "failed":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button className="flex-1" onClick={onRetry}>
            Try again
          </Button>
        </>
      );

    case "already_claimed":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button className="flex-1" disabled>
            Claim G$
          </Button>
        </>
      );

    case "verifying":
      return (
        <Button className="flex-1" disabled>
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for verification…
        </Button>
      );

    case "not_verified":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Not now
          </Button>
          <Button className="flex-1" onClick={onVerify} disabled={verifyBusy}>
            {verifyBusy ? "Opening…" : "Verify with GoodID"}
          </Button>
        </>
      );

    case "wrong_chain":
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Not now
          </Button>
          <Button className="flex-1" onClick={onSwitchChain} disabled={switchingChain}>
            {switchingChain ? "Switching…" : "Switch network"}
          </Button>
        </>
      );
  }
}

function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-xl border border-border">
      {rows.map(([key, value], i) => (
        <div
          key={key}
          className={cn(
            "flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm",
            i > 0 && "border-t border-border",
          )}
        >
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm",
        tone === "muted" && "border-border bg-muted text-secondary-foreground",
        tone === "ok" && "border-primary/20 bg-accent text-accent-foreground",
        tone === "warn" && "border-gold/40 bg-gold-soft text-gold-foreground",
        tone === "bad" && "border-destructive/25 bg-destructive/5 text-destructive",
      )}
    >
      {children}
    </p>
  );
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm">
      <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{shortenAddress(hash, 4)}</span>
      <a
        href={celoTxUrl(hash)}
        target="_blank"
        rel="noreferrer"
        className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        Celoscan <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
