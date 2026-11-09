import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isValidAddress, normalizeAddress } from "@/lib/auth/wallet";
import { getSession } from "@/lib/auth/session";
import { updateProfileSchema } from "@/lib/validation/schemas";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/**
 * Public profile view. Works without a wallet connection.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/profiles/[address]">,
) {
  const { address } = await ctx.params;
  if (!isValidAddress(address)) {
    return notFound("Profile not found");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("address, username, display_name, bio, avatar_url, created_at, updated_at")
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (error) {
    console.error("profile lookup error", error);
    return serverError("Could not load profile");
  }
  if (!data) {
    return notFound("Profile not found");
  }

  return ok(data);
}

/**
 * Update the authenticated user's own profile. The address in the path must
 * match the session subject; users cannot edit other profiles.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/profiles/[address]">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { address } = await ctx.params;
  if (!isValidAddress(address)) {
    return notFound("Profile not found");
  }
  if (normalizeAddress(address) !== session.sub) {
    return forbidden("You can only edit your own profile");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName || null,
      bio: parsed.data.bio || null,
      avatar_url: parsed.data.avatarUrl || null,
    })
    .eq("address", session.sub)
    .select(
      "address, username, display_name, bio, avatar_url, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return conflict("That username is already taken");
    }
    console.error("profile update error", error);
    return serverError("Could not update profile");
  }
  if (!data) {
    return notFound("Profile not found");
  }

  return ok(data);
}
