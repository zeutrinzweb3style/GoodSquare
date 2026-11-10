"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/states";
import type { ApiKey } from "@/lib/types";

/**
 * Manages the signed-in wallet's API keys. A newly created key is shown once;
 * after that only its prefix is visible, because the server stores a hash.
 */
export function ApiKeyManager({ apiKeys }: { apiKeys: ApiKey[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function createKey() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create key");
      }
      setCreatedKey(json.data.key);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Could not revoke key");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API keys</CardTitle>
        <CardDescription>
          Bearer credentials for the REST API. Shown once on creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="key-name">Key name</Label>
            <Input
              id="key-name"
              placeholder="My integration"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button onClick={createKey} disabled={busy || !name.trim()}>
            Create key
          </Button>
        </div>

        {createdKey ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Copy this key now. It will not be shown again.
            </p>
            <code className="mt-1 block break-all font-mono text-xs">
              {createdKey}
            </code>
          </div>
        ) : null}

        {apiKeys.length === 0 ? (
          <EmptyState
            title="No API keys"
            description="Create a key to call the API from your own code."
          />
        ) : (
          <ul className="divide-y divide-border">
            {apiKeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{key.name}</span>
                    {key.revoked_at ? (
                      <Badge variant="muted">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {key.key_prefix}…
                  </p>
                </div>
                {key.revoked_at ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => revokeKey(key.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
