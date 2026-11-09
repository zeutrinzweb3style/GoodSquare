import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { revokeApiKey } from "@/lib/developer/api-key-service";
import {
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api/response";

/** Revoke an API key. Revocation is immediate and permanent. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/api-keys/[id]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  try {
    const revoked = await revokeApiKey(session.sub, id);
    if (!revoked) return notFound("API key not found");
    return ok({ revoked: true });
  } catch (error) {
    console.error("revoke api key error", error);
    return serverError("Could not revoke API key");
  }
}
