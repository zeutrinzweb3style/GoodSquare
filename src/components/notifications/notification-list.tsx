"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { Notification } from "@/lib/types";

/**
 * The signed-in wallet's notifications. They are informational only: reading
 * or marking them never changes the state of the action they describe.
 */
export function NotificationList({
  notifications,
  unread,
}: {
  notifications: Notification[];
  unread: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAllRead() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Could not update");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Notifications</CardTitle>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          ) : (
            <Badge variant="muted">All caught up</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            description="Updates about your proposals, payments, and rewards will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((notification) => (
              <li key={notification.id} className="space-y-1 py-3 text-sm">
                <div className="flex items-center gap-2">
                  {notification.read_at === null ? (
                    <span
                      className="h-2 w-2 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  ) : null}
                  <span className="font-medium">{notification.title}</span>
                </div>
                {notification.body ? (
                  <p className="text-muted-foreground">{notification.body}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {new Date(notification.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
