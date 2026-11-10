"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { celo } from "wagmi/chains";
import { useClaimSDK } from "@goodsdks/react-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { ClaimModal } from "@/components/gooddollar/claim-modal";
import type { ClaimRunHandlers } from "@/components/gooddollar/claim-modal";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  describeClaimStatus,
  formatUnits,
  isGoodDollarSupportedChain,
} from "@/lib/gooddollar/config";
import type { ClaimStatus } from "@/lib/gooddollar/config";

interface ClaimView {
  status: ClaimStatus;
  entitlement: bigint;
  nextClaimTime?: Date;
}

const TONE_VARIANT: Record<string, "secondary" | "outline" | "muted"> = {
  success: "secondary",
  warning: "outline",
  muted: "muted",
};

/**
 * Square ID + GoodDollar UBI claim card.
 *
 * The card is the persistent summary; the claim itself runs inside a modal that
 * walks the two-signature (top-up then claim) flow. Every transaction is signed
 * by the user's own wallet; the app never holds a key. Rendered only on Celo
 * mainnet.
 */
export function GoodDollarClaim() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected || !address) {
    return (
      <ClaimAvailabilityCard
        title="Daily G$ claim"
        description="Connect your wallet to check your GoodDollar identity and claim eligibility."
        action="Connect wallet"
      />
    );
  }

  const chainSupported = isGoodDollarSupportedChain(chainId);
  if (!chainSupported) {
    return (
      <ClaimAvailabilityCard
        title="Daily G$ claim"
        description="GoodDollar runs on Celo mainnet. Switch networks to check your eligibility and open the claim flow."
        action={isSwitching ? "Switching to Celo…" : "Switch to Celo"}
        onAction={() => switchChain({ chainId: celo.id })}
        disabled={isSwitching}
      />
    );
  }

  return (
    <ClaimPanel
      address={address}
      chainSupported={chainSupported}
      switchingChain={isSwitching}
      onSwitchChain={() => switchChain({ chainId: celo.id })}
      key={`${address}:${chainId}`}
    />
  );
}

function ClaimAvailabilityCard({
  title,
  description,
  action,
  onAction,
  disabled = false,
}: {
  title: string;
  description: string;
  action: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        {onAction ? (
          <Button onClick={onAction} disabled={disabled}>
            {action}
          </Button>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">
            Use the Connect wallet button in the header to continue.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimPanel({
  address,
  chainSupported,
  switchingChain,
  onSwitchChain,
}: {
  address: string;
  chainSupported: boolean;
  switchingChain: boolean;
  onSwitchChain: () => void;
}) {
  const { sdk, loading: sdkLoading, error: sdkError } = useClaimSDK(GOODDOLLAR_ENV);
  const [view, setView] = useState<ClaimView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!sdk) return;
    let active = true;
    sdk
      .getWalletClaimStatus()
      .then((result) => {
        if (!active) return;
        setView({
          status: result.status,
          entitlement: result.entitlement,
          nextClaimTime: result.nextClaimTime,
        });
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not read claim status");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sdk]);

  async function refresh() {
    if (!sdk) return;
    setLoading(true);
    setError(null);
    try {
      const result = await sdk.getWalletClaimStatus();
      setView({
        status: result.status,
        entitlement: result.entitlement,
        nextClaimTime: result.nextClaimTime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read claim status");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Runs the SDK claim and relays its two callbacks to the modal: the faucet
   * consent gate, then the broadcast hash. Returns the confirmed transaction
   * hash for the success screen.
   */
  async function runClaim(handlers: ClaimRunHandlers): Promise<string> {
    if (!sdk) throw new Error("GoodDollar SDK is not ready yet.");
    const receipt = await sdk.claim(
      async (message) => handlers.confirmFaucet(message),
      (hash) => handlers.onSubmitted(hash),
    );
    return receipt.transactionHash;
  }

  if (loading || sdkLoading) {
    return <LoadingState label="Checking your daily G$ entitlement…" />;
  }

  if (sdkError) {
    return <ErrorState title="GoodDollar claim is unavailable" description={sdkError} />;
  }

  const status = view?.status ?? "not_whitelisted";
  const entitlement = view?.entitlement ?? 0n;
  const copy = describeClaimStatus(status);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Daily G$ claim</CardTitle>
          <Badge variant={TONE_VARIANT[copy.tone]}>{copy.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "not_whitelisted" ? (
          <p className="text-sm text-muted-foreground">
            Verify your GoodDollar identity above before you can claim G$.
          </p>
        ) : status === "can_claim" ? (
          <p className="text-sm">
            You can claim{" "}
            <span className="font-semibold">{formatUnits(entitlement)} G$</span>{" "}
            right now.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            You have already claimed today.
            {view?.nextClaimTime && view.nextClaimTime.getTime() > 0
              ? ` Next claim opens ${view.nextClaimTime.toLocaleString()}.`
              : ""}
          </p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setModalOpen(true)}
            disabled={status === "can_claim" ? !sdk : false}
          >
            {status === "can_claim" ? `Claim ${formatUnits(entitlement)} G$` : "Open claim"}
          </Button>
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          G$ is claimed directly to your wallet on Celo ({GOODDOLLAR_CELO_CHAIN_ID}
          ). Good Square never holds your funds.
        </p>
      </CardContent>

      <ClaimModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        status={status}
        entitlement={entitlement}
        nextClaimTime={view?.nextClaimTime}
        address={address}
        chainSupported={chainSupported}
        switchingChain={switchingChain}
        onSwitchChain={onSwitchChain}
        runClaim={runClaim}
        onClaimed={() => void refresh()}
      />
    </Card>
  );
}
