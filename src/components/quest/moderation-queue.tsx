"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { shortenAddress } from "@/lib/utils";

export interface ModerationSubmission {
  id: string;
  address: string;
  proof_url: string | null;
  proof_text: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  profiles?: { username?: string | null; display_name?: string | null } | null;
  quests?: {
    title?: string | null;
    exp_reward?: number | null;
    reward_token_symbol?: string | null;
    reward_amount?: string | null;
  } | null;
}

export function ModerationQueue({
  submissions,
}: {
  submissions: ModerationSubmission[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function review(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/submissions/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not review submission");
      }
      if (decision === "approved" && json?.reward) {
        setNotice(
          `Reward queued: ${json.reward.amount} ${json.reward.token} on a treasury payout plan.`,
        );
      } else if (decision === "approved" && json?.reward_skipped) {
        setNotice(`Approved. Reward not queued: ${json.reward_skipped}.`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review submission");
    } finally {
      setBusyId(null);
    }
  }

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No submissions are waiting for review.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}
      {submissions.map((submission) => (
        <Card key={submission.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {submission.profiles?.display_name ||
                  submission.profiles?.username ||
                  shortenAddress(submission.address)}
              </CardTitle>
              <div className="flex items-center gap-2">
                {submission.quests?.title ? (
                  <Badge variant="outline">{submission.quests.title}</Badge>
                ) : null}
                <Badge variant="muted">
                  {submission.quests?.exp_reward
                    ? `+${submission.quests.exp_reward} EXP`
                    : "No EXP"}
                </Badge>
                {submission.quests?.reward_token_symbol &&
                submission.quests?.reward_amount ? (
                  <Badge variant="outline">
                    {submission.quests.reward_amount}{" "}
                    {submission.quests.reward_token_symbol}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {submission.proof_url ? (
              <a
                href={submission.proof_url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-primary hover:underline"
              >
                {submission.proof_url}
              </a>
            ) : null}
            {submission.proof_text ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {submission.proof_text}
              </p>
            ) : null}
            <Textarea
              value={notes[submission.id] ?? ""}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [submission.id]: e.target.value }))
              }
              placeholder="Optional review note"
              maxLength={500}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => review(submission.id, "approved")}
                disabled={busyId === submission.id}
              >
                {busyId === submission.id ? "Working…" : "Approve"}
              </Button>
              <Button
                variant="outline"
                onClick={() => review(submission.id, "rejected")}
                disabled={busyId === submission.id}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
