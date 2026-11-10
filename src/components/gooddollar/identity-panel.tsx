"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { celo } from "wagmi/chains";
import { useIdentitySDK } from "@goodsdks/react-hooks";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GOODDOLLAR_CELO_CHAIN_ID,
  GOODDOLLAR_ENV,
  celoAddressUrl,
  isGoodDollarSupportedChain,
  unsupportedChainReason,
} from "@/lib/gooddollar/config";
import { openVerificationPopup, runInAppVerification } from "@/lib/gooddollar/verify-session";
import { cn, shortenAddress } from "@/lib/utils";

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
  const [verifying, setVerifying] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [targetAddress, setTargetAddress] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const securityResolver = useRef<((accepted: boolean) => void) | null>(null);

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
    // Open the popup synchronously, inside the click handler, so the browser
    // treats it as user-initiated and does not block it.
    const popup = openVerificationPopup();
    setError(null);
    setVerifying(true);
    try {
      const outcome = await runInAppVerification({
        popup,
        generateLink: (popupMode, callbackUrl, chainId) =>
          sdk.generateFVLink(popupMode, callbackUrl, chainId),
        chainId: GOODDOLLAR_CELO_CHAIN_ID,
      });
      if (outcome === "blocked") {
        setError(
          "Your browser blocked the verification window. Allow pop-ups for this site and try again.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start verification");
    } finally {
      setVerifying(false);
      await refresh();
    }
  }

  async function linkWallet() {
    if (!sdk) return;
    setError(null);
    const target = targetAddress.trim();
    if (!isAddress(target)) {
      setLinkError("Enter a valid Ethereum wallet address.");
      return;
    }
    setLinkError(null);
    setLinking(true);
    try {
      await sdk.connectAccount(target as `0x${string}`, {
        onSecurityMessage: async (msg) =>
          new Promise<boolean>((resolve) => {
            securityResolver.current = resolve;
            setSecurityMessage(msg);
          }),
      });
      setLinkDialogOpen(false);
      setTargetAddress("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link wallet");
    } finally {
      setLinking(false);
    }
  }

  function respondToSecurityPrompt(accepted: boolean) {
    const resolve = securityResolver.current;
    securityResolver.current = null;
    setSecurityMessage(null);
    resolve?.(accepted);
  }

  if (loading || sdkLoading) {
    return <LoadingState label="Checking GoodDollar identity…" />;
  }

  if (sdkError) {
    return <ErrorState title="GoodDollar is unavailable" description={sdkError} />;
  }

  return (
    <Card className={cn("gs-surface overflow-hidden", verified && "gs-glow")}>
      <div className="gs-hairline h-px" />
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            GoodDollar identity
          </CardTitle>
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
              This wallet is a verified GoodDollar citizen — proof of personhood
              on-chain. Claim your daily G$ UBI below.
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
            Prove you&apos;re human once with GoodDollar&apos;s face check to
            unlock G$ UBI. It&apos;s free and stays on GoodDollar — Good Square
            never sees your data.
          </p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {verified ? (
            <Button
              variant="outline"
              onClick={() => {
                setLinkError(null);
                setLinkDialogOpen(true);
              }}
              disabled={linking}
            >
              {linking ? "Linking…" : "Link another wallet"}
            </Button>
          ) : (
            <Button onClick={startVerification} disabled={!sdk || verifying}>
              {verifying ? "Waiting for verification…" : "Verify with GoodID"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={linkDialogOpen}
        onClose={() => {
          if (!linking) setLinkDialogOpen(false);
        }}
        labelledBy="link-wallet-title"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="link-wallet-title" className="text-lg font-semibold">
              Link another wallet
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a secondary wallet to your GoodDollar identity. The wallet owner
              will need to approve the security message.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary-wallet-address">Wallet address</Label>
            <Input
              id="secondary-wallet-address"
              value={targetAddress}
              onChange={(event) => setTargetAddress(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              disabled={linking}
            />
            {linkError ? <p className="text-sm text-destructive">{linkError}</p> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setLinkDialogOpen(false)}
              disabled={linking}
            >
              Cancel
            </Button>
            <Button onClick={() => void linkWallet()} disabled={linking || !targetAddress.trim()}>
              {linking ? "Linking…" : "Continue"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(securityMessage)}
        onClose={() => respondToSecurityPrompt(false)}
        labelledBy="security-message-title"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="security-message-title" className="text-lg font-semibold">
              Confirm wallet linking
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review this message carefully before approving it in your wallet.
            </p>
          </div>
          <p className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted p-3 text-sm whitespace-pre-wrap">
            {securityMessage}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => respondToSecurityPrompt(false)}>
              Cancel
            </Button>
            <Button onClick={() => respondToSecurityPrompt(true)}>Continue</Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
