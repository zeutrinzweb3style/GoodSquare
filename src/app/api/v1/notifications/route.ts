import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/notifications/service";
import {
  badRequest,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";
import { z } from "zod";

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
});

/** The caller's notifications, newest first. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const unreadOnly =
    new URL(request.url).searchParams.get("unread") === "true";

  try {
    const notifications = await listNotifications(session.sub, { unreadOnly });
    const unread = notifications.filter((n) => n.read_at === null).length;
    return ok({ notifications, unread });
  } catch (error) {
    console.error("list notifications error", error);
    return serverError("Could not load notifications");
  }
}

/** Mark notifications read. Without ids, marks all of the caller's unread. */
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await markNotificationsRead(session.sub, parsed.data.ids);
    return ok({ read: true });
  } catch (error) {
    console.error("mark notifications read error", error);
    return serverError("Could not update notifications");
  }
}
