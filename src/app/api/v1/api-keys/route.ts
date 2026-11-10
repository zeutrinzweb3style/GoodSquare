import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createApiKeySchema } from "@/lib/validation/schemas";
import {
  createApiKey,
  listApiKeys,
} from "@/lib/developer/api-key-service";
import {
  badRequest,
  created,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** The caller's API keys. The secret is never returned here. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const keys = await listApiKeys(session.sub);
    return ok({ apiKeys: keys });
  } catch (error) {
    console.error("list api keys error", error);
    return serverError("Could not load API keys");
  }
}

/**
 * Create an API key. The full key is returned exactly once, in this response;
 * only its hash is stored, so it cannot be shown again.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { key, record } = await createApiKey({
      owner: session.sub,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      environment: parsed.data.environment,
    });
    return created({ apiKey: record, key });
  } catch (error) {
    console.error("create api key error", error);
    return serverError("Could not create API key");
  }
}
