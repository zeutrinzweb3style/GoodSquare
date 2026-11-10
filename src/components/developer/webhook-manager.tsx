"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/states";
import type { WebhookEndpoint } from "@/lib/types";

const EVENT_OPTIONS = [
  "community.created",
  "member.joined",
  "quest.submitted",
  "quest.approved",
  "proposal.created",
  "proposal.closed",
  "vote.cast",
  "payment.received",
  "treasury.spending.approved",
  "treasury.spending.executed",
  "reward.paid",
] as const;

/**
 * Manages webhook subscriptions for the signed-in wallet. The signing secret is
 * shown once on creation; deliveries are signed with it.
 */
export function WebhookManager({
  endpoints,
}: {
  endpoints: WebhookEndpoint[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setEvents((current) =>
      current.includes(event)
        ? current.filter((item) => item !== event)
        : [...current, event],
    );
  }

  async function createEndpoint() {
    if (!url.trim() || events.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not create endpoint");
      }
      setSecret(json.data.endpoint.secret);
      setUrl("");
      setEvents([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create endpoint");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(endpoint: WebhookEndpoint) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/webhooks/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !endpoint.active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Could not update endpoint");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update endpoint");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEndpoint(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Could not delete endpoint");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete endpoint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Webhooks</CardTitle>
        <CardDescription>
          Receive signed POSTs when events happen. HTTPS only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            placeholder="https://example.com/webhooks/goodsquare"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Events</Label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  events.includes(event)
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {event}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={createEndpoint}
          disabled={busy || !url.trim() || events.length === 0}
        >
          Add endpoint
        </Button>

        {secret ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Signing secret. Copy it now; it will not be shown again.
            </p>
            <code className="mt-1 block break-all font-mono text-xs">
              {secret}
            </code>
          </div>
        ) : null}

        {endpoints.length === 0 ? (
          <EmptyState
            title="No webhook endpoints"
            description="Add a URL to start receiving events."
          />
        ) : (
          <ul className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="space-y-2 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{endpoint.url}</span>
                      <Badge variant={endpoint.active ? "secondary" : "muted"}>
                        {endpoint.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {endpoint.events.join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => toggleActive(endpoint)}
                    >
                      {endpoint.active ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => deleteEndpoint(endpoint.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
