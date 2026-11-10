"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PayButton } from "@/components/pay/pay-button";
import { formatAmount } from "@/lib/treasury/amounts";
import { getToken, payableTokens } from "@/lib/treasury/tokens";
import { submitWithRetry } from "@/lib/treasury/submit";
import { shortenAddress } from "@/lib/utils";
import type {
  RewardDistribution,
  RewardRecipient,
  RewardStatus,
  Treasury,
} from "@/lib/types";

const STATUS_VARIANT: Record<
  RewardStatus,
  "default" | "muted" | "outline" | "destructive"
> = {
  draft: "muted",
  active: "default",
  completed: "outline",
  cancelled: "destructive",
};

interface RecipientDraft {
  address: string;
  amount: string;
}

export function RewardsManager({
  communityId,
  treasury,
  distributions,
  canDistribute,
}: {
  communityId: string;
  treasury: Treasury | null;
  distributions: RewardDistribution[];
  canDistribute: boolean;
}) {
  const { isAuthenticated, isSigningIn, signIn } = useAuth();

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to manage rewards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo wallet and sign a message. Reward payouts go straight
            from the treasury wallet; Good Square never holds the funds.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canDistribute && treasury ? (
        <CreateDistributionForm communityId={communityId} treasury={treasury} />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Distributions</h2>
        {distributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reward distributions yet.
          </p>
        ) : (
          distributions.map((distribution) => (
            <DistributionCard
              key={distribution.id}
              distribution={distribution}
              treasury={treasury}
              canDistribute={canDistribute}
            />
          ))
        )}
      </section>
    </div>
  );
}

function CreateDistributionForm({
  communityId,
  treasury,
}: {
  communityId: string;
  treasury: Treasury;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("cUSD");
  const [recipients, setRecipients] = useState<RecipientDraft[]>([
    { address: "", amount: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokens = payableTokens(treasury.chain_id);

  function updateRecipient(index: number, patch: Partial<RecipientDraft>) {
    setRecipients((current) =>
      current.map((recipient, i) =>
        i === index ? { ...recipient, ...patch } : recipient,
      ),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/communities/${communityId}/treasury/rewards`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            tokenSymbol,
            recipients: recipients.filter(
              (recipient) => recipient.address && recipient.amount,
            ),
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create the plan");
      }
      setTitle("");
      setDescription("");
      setRecipients([{ address: "", amount: "" }]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New reward distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reward-title">Title</Label>
            <Input
              id="reward-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={140}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward-description">Description</Label>
            <Textarea
              id="reward-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward-token">Token</Label>
            <select
              id="reward-token"
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
            <Label>Recipients</Label>
            <div className="space-y-2">
              {recipients.map((recipient, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={recipient.address}
                    onChange={(e) =>
                      updateRecipient(index, { address: e.target.value })
                    }
                    placeholder="0x…"
                    aria-label={`Recipient ${index + 1} address`}
                  />
                  <Input
                    value={recipient.amount}
                    onChange={(e) =>
                      updateRecipient(index, { amount: e.target.value })
                    }
                    placeholder="0.0"
                    className="max-w-[8rem]"
                    aria-label={`Recipient ${index + 1} amount`}
                  />
                  {recipients.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setRecipients((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRecipients((current) => [
                  ...current,
                  { address: "", amount: "" },
                ])
              }
            >
              Add recipient
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Creating a plan moves nothing. Activate it, then a treasury signer
            sends each transfer and the receipt is verified before it is
            recorded.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create distribution"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DistributionCard({
  distribution,
  treasury,
  canDistribute,
}: {
  distribution: RewardDistribution;
  treasury: Treasury | null;
  canDistribute: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RewardRecipient[] | null>(null);

  const token = getToken(
    treasury?.chain_id ?? 42220,
    distribution.token_symbol,
  );

  async function loadRecipients() {
    try {
      const res = await fetch(`/api/v1/rewards/${distribution.id}`);
      const json = await res.json().catch(() => null);
      if (res.ok) setRecipients(json.data.recipients as RewardRecipient[]);
    } catch {
      setError("Could not load recipients");
    }
  }

  async function setStatus(status: "active" | "cancelled" | "completed") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/rewards/${distribution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not update");
      router.refresh();
      await loadRecipients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayout(recipientId: string, hash: `0x${string}`) {
    setError(null);
    try {
      await submitWithRetry(
        `/api/v1/rewards/${distribution.id}/recipients/${recipientId}`,
        { txHash: hash },
      );
      await loadRecipients();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payout");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{distribution.title}</CardTitle>
          <Badge variant={STATUS_VARIANT[distribution.status]}>
            {distribution.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {distribution.description || "No description."}
        </p>
        <Badge variant="outline">Paid in {distribution.token_symbol}</Badge>

        {canDistribute ? (
          <div className="flex flex-wrap gap-2">
            {distribution.status === "draft" ? (
              <Button size="sm" disabled={busy} onClick={() => setStatus("active")}>
                Activate
              </Button>
            ) : null}
            {distribution.status === "active" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setStatus("completed")}
              >
                Mark completed
              </Button>
            ) : null}
            {distribution.status !== "completed" &&
            distribution.status !== "cancelled" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setStatus("cancelled")}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                recipients === null ? loadRecipients() : setRecipients(null)
              }
            >
              {recipients === null ? "Show recipients" : "Hide recipients"}
            </Button>
          </div>
        ) : null}

        {recipients ? (
          <ul className="divide-y divide-border">
            {recipients.map((recipient) => {
              const amount = token
                ? formatAmount(BigInt(recipient.amount), token.decimals)
                : recipient.amount;
              return (
                <li
                  key={recipient.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {amount} {distribution.token_symbol}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {shortenAddress(recipient.address, 6)} · {recipient.status}
                    </p>
                  </div>
                  {canDistribute &&
                  distribution.status === "active" &&
                  recipient.status === "pending" &&
                  treasury?.address ? (
                    <PayButton
                      chainId={treasury.chain_id}
                      tokenSymbol={distribution.token_symbol}
                      to={recipient.address}
                      amount={recipient.amount}
                      label="Send & record"
                      onSent={(hash) => recordPayout(recipient.id, hash)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
