import type { NextRequest } from "next/server";
import { processWebhookQueue } from "@/lib/developer/webhook-queue";
import { apiError, ok, serverError } from "@/lib/api/response";

/**
 * Runs the webhook retry queue once. Intended to be called from a scheduled
 * job (cron) with the shared `CRON_SECRET`, either as
 * `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
 *
 * When `CRON_SECRET` is unset the endpoint is disabled: it must never be
 * callable anonymously in production.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError(
      503,
      "DISABLED",
      "The webhook queue is not configured on this deployment",
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = bearer ?? new URL(request.url).searchParams.get("secret");
  if (provided !== secret) {
    return apiError(401, "UNAUTHORIZED", "Invalid cron secret");
  }

  try {
    const result = await processWebhookQueue();
    return ok(result);
  } catch (error) {
    console.error("process webhook queue error", error);
    return serverError("Could not process the webhook queue");
  }
}
