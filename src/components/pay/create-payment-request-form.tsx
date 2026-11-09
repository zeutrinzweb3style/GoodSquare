"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/treasury/amounts";
import { getToken, payableTokens } from "@/lib/treasury/tokens";
import { QrCode } from "@/components/pay/qr-code";
import type { PaymentRequest } from "@/lib/types";

export function CreatePaymentRequestForm({
  communityId,
  chainId,
}: {
  communityId?: string;
  chainId: number;
}) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();
  const [tokenSymbol, setTokenSymbol] = useState("cUSD");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to request a payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo wallet and sign a message. Payments go straight to
            your wallet; Good Square never holds the funds.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tokens = payableTokens(chainId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: communityId ?? "",
          tokenSymbol,
          amount,
          memo,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create the request");
      }
      setCreated(json.data as PaymentRequest);
      setAmount("");
      setMemo("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="req-token">Token</Label>
              <select
                id="req-token"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {tokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="req-amount">Amount</Label>
              <Input
                id="req-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-memo">Memo</Label>
            <Input
              id="req-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={280}
              placeholder="What is this payment for?"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create payment request"}
          </Button>
        </form>

        {created ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Request created</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Share this link so anyone can pay you directly.
            </p>
            <Link
              href={`/pay/${created.id}`}
              className="mt-2 inline-block break-all font-mono text-xs text-primary hover:underline"
            >
              /pay/{created.id}
            </Link>
            <div className="mt-4">
              <QrCode
                value={`/pay/${created.id}`}
                size={140}
                label="Scan to pay"
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PaymentRequestList({
  requests,
  chainId,
}: {
  requests: PaymentRequest[];
  chainId: number;
}) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No payment requests yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => {
        const token = getToken(chainId, request.token_symbol);
        const display = token
          ? formatAmount(BigInt(request.amount), token.decimals)
          : request.amount;
        return (
          <li key={request.id} className="flex items-center justify-between py-3 text-sm">
            <div>
              <p className="font-medium">
                {display} {request.token_symbol}
              </p>
              <p className="text-xs text-muted-foreground">
                {request.memo || "No memo"} · {request.status}
              </p>
            </div>
            <Link
              href={`/pay/${request.id}`}
              className="text-xs text-primary hover:underline"
            >
              Open
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
