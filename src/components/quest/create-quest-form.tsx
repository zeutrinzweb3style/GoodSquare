"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QUEST_CATEGORIES, type QuestCategory } from "@/lib/types";

export function CreateQuestForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<QuestCategory>("custom");
  const [requirements, setRequirements] = useState("");
  const [rewardInfo, setRewardInfo] = useState("");
  const [expReward, setExpReward] = useState("0");
  const [deadline, setDeadline] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to create a quest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo-compatible wallet and sign a message. Only community
            owners, admins, and moderators can create quests.
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
        Create quest
      </Button>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/quests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          requirements,
          rewardInfo,
          expReward: Number(expReward) || 0,
          deadline: deadline ? new Date(deadline).toISOString() : "",
          status: "active",
          verifiedOnly,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create quest");
      }
      setTitle("");
      setDescription("");
      setRequirements("");
      setRewardInfo("");
      setExpReward("0");
      setDeadline("");
      setVerifiedOnly(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create quest");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New quest</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quest-title">Title</Label>
            <Input
              id="quest-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-description">Description</Label>
            <Textarea
              id="quest-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quest-category">Category</Label>
              <select
                id="quest-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as QuestCategory)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {QUEST_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quest-exp">EXP reward</Label>
              <Input
                id="quest-exp"
                type="number"
                min={0}
                max={100000}
                value={expReward}
                onChange={(e) => setExpReward(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Awarded automatically when a submission is approved. EXP is a
                reputation metric, not a currency.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-requirements">Requirements</Label>
            <Textarea
              id="quest-requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="What must a member do to complete this quest?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-reward">Reward information</Label>
            <Input
              id="quest-reward"
              value={rewardInfo}
              onChange={(e) => setRewardInfo(e.target.value)}
              maxLength={500}
              placeholder="Optional description only. Token payouts are issued by the community from its treasury."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-deadline">Deadline</Label>
            <Input
              id="quest-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                GoodDollar-verified members only
              </span>
              <span className="mt-1 block text-muted-foreground">
                Only wallets verified as GoodDollar citizens may submit this
                quest.
              </span>
            </span>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create quest"}
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
