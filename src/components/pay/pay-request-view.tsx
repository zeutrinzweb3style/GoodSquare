"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayButton } from "@/components/pay/pay-button";
import { formatAmount } from "@/lib/treasury/amounts";
import { getToken } from "@/lib/treasury/tokens";
import { submitWithRetry } from "@/lib/treasury/submit";
import { shortenAddress } from "@/lib/utils";
import type { PaymentRequest } from "@/lib/types";

export function PayRequestView({ request }: { request: PaymentRequest }) {
  const router = useRouter();
  const { address } = useAccount();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const token = getToken(request.chain_id, request.token_symbol);
  const display = token
    ? formatAmount(BigInt(request.amount), token.decimals)
    : request.amount;

  async function handlePaid(hash: `0x${string}`) {
    setError(null);
    try {
      await submitWithRetry("/api/v1/payments", {
        paymentRequestId: request.id,
        payeeAddress: request.payee_address,
        tokenSymbol: request.token_symbol,
        amount: request.amount,
        txHash: hash,
      });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment");
    }
  }

  const isPayee =
    address && address.toLowerCase() === request.payee_address.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>Payment request</CardTitle>
          <Badge
            variant={
              request.status === "paid"
                ? "default"
                : request.status === "open"
                  ? "muted"
                  : "destructive"
            }
          >
            {request.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-3xl font-semibold tracking-tight">
            {display} {request.token_symbol}
          </p>
          {request.memo ? (
            <p className="mt-1 text-sm text-muted-foreground">{request.memo}</p>
          ) : null}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pay to</dt>
            <dd className="font-mono">{shortenAddress(request.payee_address, 6)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Network</dt>
            <dd>{request.chain_id === 42220 ? "Celo" : "Celo Sepolia"}</dd>
          </div>
        </dl>

        {request.status === "paid" ? (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            This request has been paid.
            {request.paid_tx_hash ? (
              <a
                href={`https://celoscan.io/tx/${request.paid_tx_hash}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 break-all font-mono text-xs text-primary hover:underline"
              >
                {shortenAddress(request.paid_tx_hash, 6)}
              </a>
            ) : null}
          </div>
        ) : request.status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">
            This request was cancelled.
          </p>
        ) : !isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in with your wallet to pay this request. Funds go directly to
              the payee; Good Square never holds them.
            </p>
            <Button onClick={() => signIn()} disabled={isSigningIn}>
              {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
            </Button>
          </div>
        ) : isPayee ? (
          <p className="text-sm text-muted-foreground">
            This is your own request. Share the link so someone can pay you.
          </p>
        ) : done ? (
          <p className="text-sm text-primary">
            Payment verified and recorded. Thank you.
          </p>
        ) : (
          <PayButton
            chainId={request.chain_id}
            tokenSymbol={request.token_symbol}
            to={request.payee_address}
            amount={request.amount}
            onSent={handlePaid}
          />
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
