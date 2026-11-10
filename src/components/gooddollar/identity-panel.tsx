"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { celo } from "wagmi/chains";
import { useIdentitySDK } from "@goodsdks/react-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/states";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  celoAddressUrl,
  isGoodDollarSupportedChain,
  unsupportedChainReason,
} from "@/lib/gooddollar/config";
import { shortenAddress } from "@/lib/utils";

interface IdentityStatusResponse {
  supported: boolean;
  reason?: string;
  isWhitelisted?: boolean;
  root?: string;
  lastAuthenticated?: number | null;
}

async function fetchIdentityStatus(
  address: string,
  chainId: number,
): Promise<IdentityStatusResponse> {
  const res = await fetch(
    `/api/v1/gooddollar/identity?address=${address}&chainId=${chainId}`,
    { cache: "no-store" },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? "Could not read identity status");
  }
  return json.data as IdentityStatusResponse;
}

/**
 * Square ID + GoodDollar identity panel.
 *
 * GoodDollar has no testnet deployment, so this panel only renders on Celo
 * mainnet. It reads status from the app's own read-only endpoint and, when the
 * wallet is not yet verified, hands off to GoodDollar's face verification flow.
 */
export function GoodDollarIdentity() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected || !address) {
    return null;
  }

  if (!isGoodDollarSupportedChain(chainId)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GoodDollar identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {unsupportedChainReason(chainId)}
          </p>
          <Button
            onClick={() => switchChain({ chainId: celo.id })}
            disabled={isSwitching}
          >
            {isSwitching ? "Switching…" : "Switch to Celo"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <VerifiedPanel
      address={address}
      chainId={chainId}
      key={`${address}:${chainId}`}
    />
  );
}

function VerifiedPanel({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}) {
  const { sdk, loading: sdkLoading, error: sdkError } = useIdentitySDK(
    GOODDOLLAR_ENV,
  );
  const [status, setStatus] = useState<IdentityStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let active = true;
    fetchIdentityStatus(address, chainId)
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not read identity status",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address, chainId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchIdentityStatus(address, chainId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read identity status",
      );
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  const verified = Boolean(status?.supported && status.isWhitelisted);

  async function startVerification() {
    if (!sdk) return;
    setError(null);
    try {
      const link = await sdk.generateFVLink(
        false,
        window.location.href,
        GOODDOLLAR_CELO_CHAIN_ID,
      );
      window.location.href = link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start verification");
    }
  }

  async function linkWallet() {
    if (!sdk) return;
    setError(null);
    const target = window.prompt(
      "Enter the secondary wallet address to link to your GoodDollar identity",
    );
    if (!target) return;
    setLinking(true);
    try {
      await sdk.connectAccount(target as `0x${string}`, {
        onSecurityMessage: async (msg) => window.confirm(msg),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link wallet");
    } finally {
      setLinking(false);
    }
  }

  if (loading || sdkLoading) {
    return <LoadingState label="Checking GoodDollar identity…" />;
  }

  if (sdkError) {
    return <ErrorState title="GoodDollar is unavailable" description={sdkError} />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>GoodDollar identity</CardTitle>
          {verified ? (
            <Badge variant="secondary">Verified citizen</Badge>
          ) : (
            <Badge variant="outline">Not verified</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {verified ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              This wallet is verified as a GoodDollar citizen and can claim G$
              once per day.
            </p>
            <p>
              Root identity:{" "}
              <a
                className="font-mono text-primary underline-offset-4 hover:underline"
                href={celoAddressUrl(status?.root ?? address)}
                target="_blank"
                rel="noreferrer"
              >
                {shortenAddress(status?.root ?? address, 6)}
              </a>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Verify your wallet once with GoodDollar&apos;s face verification to
            become a citizen. Verification is free and stays on GoodDollar.
          </p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {verified ? (
            <Button variant="outline" onClick={linkWallet} disabled={linking}>
              {linking ? "Linking…" : "Link another wallet"}
            </Button>
          ) : (
            <Button onClick={startVerification} disabled={!sdk}>
              Verify with GoodID
            </Button>
          )}
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
