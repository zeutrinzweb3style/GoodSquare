"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { VoteChoice } from "@/lib/types";

export interface VotePanelResults {
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  total_votes: number;
  quorum_met: boolean;
  approval_met: boolean;
  passed: boolean;
  approval_share: number | null;
  participation_share: number | null;
}

export function VotePanel({
  proposalId,
  results,
  eligible,
  quorumPercent,
  approvalThreshold,
  phase,
  myVote,
  canVote,
}: {
  proposalId: string;
  results: VotePanelResults;
  eligible: number;
  quorumPercent: number;
  approvalThreshold: number;
  phase: "not-started" | "open" | "ended";
  myVote: VoteChoice | null;
  canVote: boolean;
}) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();
  const [choice, setChoice] = useState<VoteChoice>("for");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decisive = results.votes_for + results.votes_against;
  const approvalPct =
    decisive > 0 ? Math.round((results.votes_for / decisive) * 100) : 0;
  const participationPct =
    eligible > 0 ? Math.round((results.total_votes / eligible) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Current results</CardTitle>
            {phase === "ended" || results.total_votes > 0 ? (
              <Badge variant={results.passed ? "default" : "muted"}>
                {results.passed ? "Passing" : "Not passing"}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-semibold">{results.votes_for}</p>
              <p className="text-xs text-muted-foreground">For</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{results.votes_against}</p>
              <p className="text-xs text-muted-foreground">Against</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{results.votes_abstain}</p>
              <p className="text-xs text-muted-foreground">Abstain</p>
            </div>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              Approval: {approvalPct}% (needs {approvalThreshold}%) —{" "}
              {results.approval_met ? "met" : "not met"}
            </li>
            <li>
              Participation: {participationPct}% of {eligible} eligible (needs{" "}
              {quorumPercent}%) — {results.quorum_met ? "met" : "not met"}
            </li>
            <li>
              One wallet, one vote. {results.total_votes}{" "}
              {results.total_votes === 1 ? "vote" : "votes"} cast.
            </li>
          </ul>
        </CardContent>
      </Card>

      {myVote ? (
        <Card>
          <CardContent className="py-6 text-sm">
            <p className="font-medium capitalize">
              You voted: {myVote}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              One wallet, one vote — a vote cannot be changed once cast.
            </p>
          </CardContent>
        </Card>
      ) : !isAuthenticated ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              Sign in with your wallet to vote.
            </p>
            <Button onClick={() => signIn()} disabled={isSigningIn}>
              {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
            </Button>
          </CardContent>
        </Card>
      ) : !canVote ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            You are not eligible to vote on this proposal.
          </CardContent>
        </Card>
      ) : phase !== "open" ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {phase === "not-started"
              ? "Voting has not started yet."
              : "Voting has ended."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cast your vote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["for", "against", "abstain"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={choice === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChoice(value)}
                  className="capitalize"
                >
                  {value}
                </Button>
              ))}
            </div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional note explaining your vote"
              maxLength={500}
              rows={2}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                setError(null);
                try {
                  const res = await fetch(
                    `/api/v1/proposals/${proposalId}/vote`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ choice, reason }),
                    },
                  );
                  const json = await res.json().catch(() => null);
                  if (!res.ok) {
                    throw new Error(
                      json?.error?.message ?? "Could not cast vote",
                    );
                  }
                  router.refresh();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Could not cast vote",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Submitting…" : `Vote ${choice}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
