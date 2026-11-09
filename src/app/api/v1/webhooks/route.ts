import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createWebhookEndpointSchema } from "@/lib/validation/schemas";
import {
  createWebhookEndpoint,
  isAllowedWebhookUrl,
  listWebhookEndpoints,
} from "@/lib/developer/webhook-service";
import { normalizeEvents } from "@/lib/developer/webhooks";
import { omit } from "@/lib/developer/serialize";
import {
  badRequest,
  created,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** The caller's webhook endpoints. The signing secret is never returned. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const endpoints = (await listWebhookEndpoints(session.sub)).map(
      (endpoint) => omit(endpoint, ["secret"]),
    );
    return ok({ endpoints });
  } catch (error) {
    console.error("list webhook endpoints error", error);
    return serverError("Could not load webhook endpoints");
  }
}

/** Subscribe a URL to events. The signing secret is returned once. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createWebhookEndpointSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  if (!isAllowedWebhookUrl(parsed.data.url)) {
    return badRequest(
      "Provide a public HTTPS URL; localhost and private addresses are not allowed",
    );
  }

  const events = normalizeEvents(parsed.data.events);
  if (events.length === 0) {
    return badRequest("Select at least one known event");
  }

  try {
    const endpoint = await createWebhookEndpoint({
      owner: session.sub,
      url: parsed.data.url,
      events,
      communityId: parsed.data.communityId || null,
    });
    // Return the secret once so the caller can verify signatures.
    return created({ endpoint });
  } catch (error) {
    console.error("create webhook endpoint error", error);
    return serverError("Could not create webhook endpoint");
  }
}
