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
  SpendingStatus,
  Treasury,
  TreasurySpendingProposal,
} from "@/lib/types";

const STATUS_VARIANT: Record<
  SpendingStatus,
  "default" | "muted" | "outline" | "destructive"
> = {
  pending: "muted",
  approved: "default",
  executed: "outline",
  rejected: "destructive",
  cancelled: "destructive",
};

export function TreasuryManager({
  communityId,
  chainId,
  treasury,
  proposals,
  approvalsByProposal,
  canManage,
  canSpend,
}: {
  communityId: string;
  chainId: number;
  treasury: Treasury | null;
  proposals: TreasurySpendingProposal[];
  approvalsByProposal: Record<
    string,
    { approved: number; required: number; mine: boolean }
  >;
  canManage: boolean;
  canSpend: boolean;
}) {
  const { isAuthenticated, isSigningIn, signIn } = useAuth();

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to manage the treasury</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo wallet and sign a message. Funds always stay in the
            community&apos;s own wallet; Good Square never holds them.
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
      {!treasury && canManage ? (
        <CreateTreasuryForm communityId={communityId} chainId={chainId} />
      ) : null}

      {treasury ? (
        <TreasurySettings
          communityId={communityId}
          treasury={treasury}
          canManage={canManage}
        />
      ) : null}

      {canSpend ? (
        <CreateSpendingForm communityId={communityId} treasury={treasury} />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Spending proposals
        </h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No spending proposals yet.
          </p>
        ) : (
          proposals.map((proposal) => (
            <SpendingCard
              key={proposal.id}
              proposal={proposal}
              treasury={treasury}
              progress={approvalsByProposal[proposal.id] ?? null}
              canSpend={canSpend}
            />
          ))
        )}
      </section>

      {canSpend && treasury ? (
        <RecordTransactionForm communityId={communityId} treasury={treasury} />
      ) : null}
    </div>
  );
}

function CreateTreasuryForm({
  communityId,
  chainId,
}: {
  communityId: string;
  chainId: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("Community Treasury");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/treasury`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, chainId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create the treasury");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create treasury");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create the treasury</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="treasury-name">Name</Label>
            <Input
              id="treasury-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="treasury-address">Treasury wallet address</Label>
            <Input
              id="treasury-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… (multisig or community wallet)"
            />
            <p className="text-xs text-muted-foreground">
              Optional now, but required before balances and transfers can be
              recorded. Good Square only reads this address; it never controls it.
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create treasury"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TreasurySettings({
  communityId,
  treasury,
  canManage,
}: {
  communityId: string;
  treasury: Treasury;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(treasury.name);
  const [address, setAddress] = useState(treasury.address ?? "");
  const [isActive, setIsActive] = useState(treasury.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/treasury`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not update the treasury");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Treasury</CardTitle>
      </CardHeader>
      <CardContent>
        {!canManage ? (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{treasury.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="font-mono">
                {treasury.address ? shortenAddress(treasury.address, 6) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={treasury.is_active ? "default" : "muted"}>
                  {treasury.is_active ? "active" : "inactive"}
                </Badge>
              </dd>
            </div>
          </dl>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="treasury-edit-name">Name</Label>
              <Input
                id="treasury-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="treasury-edit-address">Address</Label>
              <Input
                id="treasury-edit-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active (spending proposals can be executed)
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSpendingForm({
  communityId,
  treasury,
}: {
  communityId: string;
  treasury: Treasury | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("cUSD");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!treasury) return null;

  const tokens = payableTokens(treasury.chain_id);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/communities/${communityId}/treasury/spending`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            tokenSymbol,
            amount,
            recipient,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create the proposal");
      }
      setTitle("");
      setDescription("");
      setAmount("");
      setRecipient("");
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
        <CardTitle>Propose a spend</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spend-title">Title</Label>
            <Input
              id="spend-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={140}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spend-description">Description</Label>
            <Textarea
              id="spend-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="spend-token">Token</Label>
              <select
                id="spend-token"
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
              <Label htmlFor="spend-amount">Amount</Label>
              <Input
                id="spend-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spend-recipient">Recipient</Label>
              <Input
                id="spend-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x…"
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Proposing records intent only. Nothing moves until an approved
            proposal is executed from the treasury wallet.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Create spending proposal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SpendingCard({
  proposal,
  treasury,
  progress,
  canSpend,
}: {
  proposal: TreasurySpendingProposal;
  treasury: Treasury | null;
  progress: { approved: number; required: number; mine: boolean } | null;
  canSpend: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = getToken(
    treasury?.chain_id ?? 42220,
    proposal.token_symbol,
  );
  const display = token
    ? formatAmount(BigInt(proposal.amount), token.decimals)
    : proposal.amount;

  async function review(decision: "approved" | "rejected" | "cancelled") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/treasury/spending/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not update");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function recordExecution(hash: `0x${string}`) {
    setError(null);
    try {
      await submitWithRetry(
        `/api/v1/treasury/spending/${proposal.id}/execute`,
        { txHash: hash },
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record execution");
    }
  }

  async function withdrawApproval() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/treasury/spending/${proposal.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not withdraw");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{proposal.title}</CardTitle>
          <Badge variant={STATUS_VARIANT[proposal.status]}>
            {proposal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {proposal.description || "No description."}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {display} {proposal.token_symbol}
          </Badge>
          <span>to</span>
          <span className="font-mono">{shortenAddress(proposal.recipient, 6)}</span>
        </div>
        {progress && proposal.status === "pending" ? (
          <p className="text-xs text-muted-foreground">
            {progress.required > 1
              ? `${progress.approved} of ${progress.required} signer approvals`
              : "Awaiting approval"}
          </p>
        ) : null}
        {proposal.executed_tx_hash ? (
          <p className="break-all text-xs text-muted-foreground">
            tx {proposal.executed_tx_hash}
          </p>
        ) : null}

        {canSpend && proposal.status === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => review("approved")}>
              Approve
            </Button>
            {progress?.mine ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={withdrawApproval}
              >
                Withdraw approval
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => review("rejected")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => review("cancelled")}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        {canSpend && proposal.status === "approved" ? (
          treasury?.address ? (
            <div className="space-y-2">
              <PayButton
                chainId={treasury.chain_id}
                tokenSymbol={proposal.token_symbol}
                to={proposal.recipient}
                amount={proposal.amount}
                label={`Send ${display} ${proposal.token_symbol} and record`}
                onSent={recordExecution}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => review("cancelled")}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <p className="text-sm text-destructive">
              Set the treasury address before executing this spend.
            </p>
          )
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function RecordTransactionForm({
  communityId,
  treasury,
}: {
  communityId: string;
  treasury: Treasury;
}) {
  const router = useRouter();
  const [tokenSymbol, setTokenSymbol] = useState("cUSD");
  const [amount, setAmount] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState(treasury.address ?? "");
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokens = payableTokens(treasury.chain_id);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await submitWithRetry(
        `/api/v1/communities/${communityId}/treasury/transactions`,
        { tokenSymbol, amount, fromAddress, toAddress, txHash },
      );
      setMessage("Transaction verified and recorded.");
      setAmount("");
      setTxHash("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a transfer</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tx-token">Token</Label>
              <select
                id="tx-token"
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
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-from">From</Label>
              <Input
                id="tx-from"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="0x…"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-to">To</Label>
              <Input
                id="tx-to"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x…"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-hash">Transaction hash</Label>
            <Input
              id="tx-hash"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0x…"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            One side must be the treasury address. Direction is inferred, and the
            transfer is verified on-chain before it is recorded.
          </p>
          {message ? (
            <p className="text-sm text-primary">{message}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Record transfer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
