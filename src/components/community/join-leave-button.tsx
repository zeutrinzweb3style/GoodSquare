"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import type { CommunityRole } from "@/lib/permissions";

export function JoinLeaveButton({
  communityId,
  communitySlug,
  visibility,
  role,
}: {
  communityId: string;
  communitySlug: string;
  visibility: "public" | "private";
  role: CommunityRole | null;
}) {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Button onClick={() => signIn()} disabled={isSigningIn} variant="outline">
        {isSigningIn ? "Check your wallet…" : "Sign in to join"}
      </Button>
    );
  }

  if (role) {
    if (role === "owner") {
      return (
        <span className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          You own this community
        </span>
      );
    }
    return (
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/v1/communities/${communityId}/join`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const json = await res.json().catch(() => null);
            setError(json?.error?.message ?? "Could not leave community");
            setBusy(false);
            return;
          }
          router.refresh();
          setBusy(false);
        }}
      >
        {busy ? "Leaving…" : "Leave community"}
      </Button>
    );
  }

  if (visibility === "private") {
    return (
      <span className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
        Private community — invitation required
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/v1/communities/${communityId}/join`, {
            method: "POST",
          });
          if (!res.ok) {
            const json = await res.json().catch(() => null);
            setError(json?.error?.message ?? "Could not join community");
            setBusy(false);
            return;
          }
          router.refresh();
          setBusy(false);
        }}
      >
        {busy ? "Joining…" : "Join community"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <span className="sr-only">{communitySlug}</span>
    </div>
  );
}
