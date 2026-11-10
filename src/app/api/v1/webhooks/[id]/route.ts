import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateWebhookEndpointSchema } from "@/lib/validation/schemas";
import {
  deleteWebhookEndpoint,
  isAllowedWebhookUrl,
  updateWebhookEndpoint,
} from "@/lib/developer/webhook-service";
import { normalizeEvents } from "@/lib/developer/webhooks";
import { omit } from "@/lib/developer/serialize";
import {
  badRequest,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** Update a webhook endpoint: change the URL, events, or active flag. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/webhooks/[id]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = updateWebhookEndpointSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.url && !isAllowedWebhookUrl(parsed.data.url)) {
    return badRequest(
      "Provide a public HTTPS URL; localhost and private addresses are not allowed",
    );
  }

  const patch: { url?: string; events?: string[]; active?: boolean } = {};
  if (parsed.data.url !== undefined) patch.url = parsed.data.url;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.events !== undefined) {
    const events = normalizeEvents(parsed.data.events);
    if (events.length === 0) {
      return badRequest("Select at least one known event");
    }
    patch.events = events;
  }

  try {
    const endpoint = await updateWebhookEndpoint(session.sub, id, patch);
    if (!endpoint) return notFound("Webhook endpoint not found");
    return ok({ endpoint: omit(endpoint, ["secret"]) });
  } catch (error) {
    console.error("update webhook endpoint error", error);
    return serverError("Could not update webhook endpoint");
  }
}

/** Delete a webhook endpoint and its delivery history. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/webhooks/[id]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  try {
    const deleted = await deleteWebhookEndpoint(session.sub, id);
    if (!deleted) return notFound("Webhook endpoint not found");
    return ok({ deleted: true });
  } catch (error) {
    console.error("delete webhook endpoint error", error);
    return serverError("Could not delete webhook endpoint");
  }
}
