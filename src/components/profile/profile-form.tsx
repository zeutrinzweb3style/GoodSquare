"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/lib/types";

export function ProfileForm() {
  const { address, profile, isAuthenticated, isLoading, isSigningIn, signIn } =
    useAuth();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect a wallet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the Connect Wallet button in the header to get started.
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated || !profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in with your wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign a message to prove you control this wallet. This does not cost
            gas and does not trigger a transaction.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Remount the editable form whenever the loaded profile changes, so initial
  // state comes from props without a syncing effect.
  return <ProfileEditor key={profile.address} profile={profile} />;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const { address, refreshProfile, setProfile } = useAuth();

  const [username, setUsername] = useState(profile.username ?? "");
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/profiles/${address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, bio, avatarUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        const issues = json?.error?.details?.issues as
          | { path: string; message: string }[]
          | undefined;
        throw new Error(
          issues?.length
            ? `${json.error.message}: ${issues
                .map((i) => `${i.path} ${i.message}`)
                .join(", ")}`
            : (json?.error?.message ?? "Could not save profile"),
        );
      }
      setProfile(json.data);
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Square ID</CardTitle>
          <Badge variant="outline" className="font-mono">
            {profile.address.slice(0, 6)}…{profile.address.slice(-4)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              required
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers, underscores, and hyphens.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              placeholder="Tell communities about yourself"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saved ? <p className="text-sm text-primary">Profile saved.</p> : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
