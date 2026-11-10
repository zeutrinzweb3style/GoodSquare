"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { useClaimSDK } from "@goodsdks/react-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/states";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  celoTxUrl,
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
 * The claim is a real mainnet transaction signed by the user's own wallet; the
 * app never holds a key. Rendered only on Celo mainnet.
 */
export function GoodDollarClaim() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected || !address) {
    return null;
  }
  if (!isGoodDollarSupportedChain(chainId)) {
    return null;
  }

  return <ClaimPanel key={`${address}:${chainId}`} />;
}

function ClaimPanel() {
  const { sdk, loading: sdkLoading, error: sdkError } = useClaimSDK(GOODDOLLAR_ENV);
  const [view, setView] = useState<ClaimView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [confirmedTx, setConfirmedTx] = useState<string | null>(null);

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

  async function claim() {
    if (!sdk) return;
    setError(null);
    setClaiming(true);
    try {
      const receipt = await sdk.claim(async (message) => {
        // The SDK asks for confirmation before it may need a second (faucet)
        // transaction to cover gas. The user must approve it in their wallet.
        window.confirm(message);
      });
      setConfirmedTx(receipt.transactionHash);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  if (loading || sdkLoading) {
    return <LoadingState label="Checking your daily G$ entitlement…" />;
  }

  if (sdkError) {
    return <ErrorState title="GoodDollar claim is unavailable" description={sdkError} />;
  }

  const status = view?.status ?? "not_whitelisted";
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
            <span className="font-semibold">
              {formatUnits(view?.entitlement ?? 0n)} G$
            </span>{" "}
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

        {confirmedTx ? (
          <p className="text-sm text-primary">
            Claimed.{" "}
            <a
              className="underline underline-offset-4"
              href={celoTxUrl(confirmedTx)}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={claim}
            disabled={claiming || status !== "can_claim" || !sdk}
          >
            {claiming ? "Check your wallet…" : "Claim G$"}
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={claiming}>
            Refresh
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          G$ is claimed directly to your wallet on Celo ({GOODDOLLAR_CELO_CHAIN_ID}
          ). Good Square never holds your funds.
        </p>
      </CardContent>
    </Card>
  );
}
