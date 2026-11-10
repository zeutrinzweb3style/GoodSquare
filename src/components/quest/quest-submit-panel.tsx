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

interface Submission {
  id: string;
  status: "pending" | "approved" | "rejected";
  proof_url: string | null;
  proof_text: string | null;
  review_note: string | null;
  reward_queued?: boolean;
}

export function QuestSubmitPanel({
  questId,
  isMember,
  questStatus,
  existing,
  rewardLabel,
}: {
  questId: string;
  isMember: boolean;
  questStatus: string;
  existing: Submission | null;
  rewardLabel?: string | null;
}) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();
  const [proofUrl, setProofUrl] = useState("");
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submit proof</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign in with your wallet to submit proof of completion.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (existing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Your submission</CardTitle>
            <Badge
              variant={
                existing.status === "approved"
                  ? "default"
                  : existing.status === "rejected"
                    ? "outline"
                    : "muted"
              }
            >
              {existing.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {existing.proof_url ? (
            <p>
              <a
                href={existing.proof_url}
                className="text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {existing.proof_url}
              </a>
            </p>
          ) : null}
          {existing.proof_text ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {existing.proof_text}
            </p>
          ) : null}
          {existing.review_note ? (
            <p className="text-muted-foreground">
              Reviewer note: {existing.review_note}
            </p>
          ) : null}
          {existing.status === "approved" && rewardLabel ? (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {existing.reward_queued
                ? `Reward queued: ${rewardLabel} from the community treasury. A treasury signer sends it; you will be notified when it is paid.`
                : `This quest offers ${rewardLabel}. Ask a community admin if it has not been queued for you.`}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            One submission per quest. Submitting again is not possible.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!isMember) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submit proof</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Join this community before submitting proof for its quests.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (questStatus !== "active") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submit proof</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This quest is {questStatus} and is not accepting submissions.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/quests/${questId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofUrl, proofText }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not submit proof");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit proof");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit proof</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-url">Proof URL</Label>
            <Input
              id="proof-url"
              type="url"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof-text">Written proof</Label>
            <Textarea
              id="proof-text"
              value={proofText}
              onChange={(e) => setProofText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Describe what you completed."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Provide at least one of the two. A moderator reviews every
            submission before any EXP is awarded.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit proof"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
