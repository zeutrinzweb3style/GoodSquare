import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listWebhookDeliveries } from "@/lib/developer/webhook-service";
import { ok, serverError, unauthorized } from "@/lib/api/response";

/** Recent deliveries for one of the caller's webhook endpoints. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/webhooks/[id]/deliveries">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  try {
    const deliveries = await listWebhookDeliveries(session.sub, id);
    return ok({ deliveries });
  } catch (error) {
    console.error("list webhook deliveries error", error);
    return serverError("Could not load deliveries");
  }
}
