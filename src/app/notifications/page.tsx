import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/service";
import { NotificationList } from "@/components/notifications/notification-list";
import { EmptyState, LoadingState } from "@/components/ui/states";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading notifications…" />}>
      <NotificationsHome />
    </Suspense>
  );
}

async function NotificationsHome() {
  await connection();
  const session = await getSession();

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <div className="mt-8">
          <EmptyState
            title="Sign in to see notifications"
            description="Connect your Celo wallet and sign a message to view updates."
          />
        </div>
      </main>
    );
  }

  const notifications = await listNotifications(session.sub);
  const unread = notifications.filter((n) => n.read_at === null).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Updates about your proposals, payments, and rewards.
      </p>
      <div className="mt-8">
        <NotificationList notifications={notifications} unread={unread} />
      </div>
    </main>
  );
}
