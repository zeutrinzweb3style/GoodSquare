"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateCommunityForm() {
  const router = useRouter();
  const { isAuthenticated, isSigningIn, signIn } = useAuth();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to create a community</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Celo-compatible wallet and sign a message to prove
            ownership. You become the owner of any community you create.
          </p>
          <Button onClick={() => signIn()} disabled={isSigningIn}>
            {isSigningIn ? "Check your wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          visibility,
          verifiedOnly,
        }),
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
            : (json?.error?.message ?? "Could not create community"),
        );
      }
      router.push(`/communities/${json.data.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create community");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Community name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              placeholder="Celo Builders"
              required
              minLength={3}
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="celo-builders"
              required
              minLength={3}
              maxLength={48}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. Used in the community
              URL.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "public" | "private")
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="public">Public — anyone can view and join</option>
              <option value="private">
                Private — visible to members only
              </option>
            </select>
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
                Only wallets verified as GoodDollar citizens may join. Uses the
                on-chain GoodDollar identity registry.
              </span>
            </span>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create community"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
