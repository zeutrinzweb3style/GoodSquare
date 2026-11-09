"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_ROLES, type CommunityRole } from "@/lib/permissions";

export function CreateProposalForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [voterRole, setVoterRole] = useState<CommunityRole>("member");
  const [quorumPercent, setQuorumPercent] = useState("0");
  const [approvalThreshold, setApprovalThreshold] = useState("50");
  const [votingStartsAt, setVotingStartsAt] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to create a proposal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo-compatible wallet and sign a message. Only community
            owners, admins, moderators, and contributors can create proposals.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Create proposal
      </Button>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          voterRole,
          quorumPercent: Number(quorumPercent) || 0,
          approvalThreshold: Number(approvalThreshold) || 0,
          votingStartsAt: votingStartsAt
            ? new Date(votingStartsAt).toISOString()
            : "",
          votingEndsAt: votingEndsAt
            ? new Date(votingEndsAt).toISOString()
            : "",
          status: "active",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create proposal");
      }
      setTitle("");
      setDescription("");
      setVotingStartsAt("");
      setVotingEndsAt("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create proposal",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New proposal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proposal-title">Title</Label>
            <Input
              id="proposal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={140}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proposal-description">Description</Label>
            <Textarea
              id="proposal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={4}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="proposal-voter-role">Who may vote</Label>
              <select
                id="proposal-voter-role"
                value={voterRole}
                onChange={(e) => setVoterRole(e.target.value as CommunityRole)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {COMMUNITY_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value === "visitor" ? "Any connected wallet" : `${value}+`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-quorum">Quorum (%)</Label>
              <Input
                id="proposal-quorum"
                type="number"
                min={0}
                max={100}
                value={quorumPercent}
                onChange={(e) => setQuorumPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-approval">Approval threshold (%)</Label>
              <Input
                id="proposal-approval"
                type="number"
                min={0}
                max={100}
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposal-starts">Voting starts</Label>
              <Input
                id="proposal-starts"
                type="datetime-local"
                value={votingStartsAt}
                onChange={(e) => setVotingStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-ends">Voting ends</Label>
              <Input
                id="proposal-ends"
                type="datetime-local"
                value={votingEndsAt}
                onChange={(e) => setVotingEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            One wallet, one vote. Quorum is the share of eligible members who
            must vote; the approval threshold is the share of decisive votes
            that must be in favour. Abstentions count toward quorum only.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create proposal"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
