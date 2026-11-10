import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { createCommunitySchema, listCommunitiesQuerySchema } from "@/lib/validation/schemas";
import { normalizeAddress } from "@/lib/auth/wallet";
import {
  badRequest,
  conflict,
  created,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";
import { serializeCommunity, writeAuditLog } from "@/lib/community/service";
import { emitWebhookEvent } from "@/lib/developer/webhook-service";

/** List public communities. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = listCommunitiesQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const { limit, offset } = parsed.data;

  const supabase = createServiceRoleClient();
  const { data, error, count } = await supabase
    .from("communities")
    .select("*", { count: "exact" })
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("list communities error", error);
    return serverError("Could not load communities");
  }

  return ok({
    communities: (data ?? []).map((row) => serializeCommunity(row, null)),
    total: count ?? 0,
    limit,
    offset,
  });
}

/** Create a community. The authenticated user becomes the owner. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createCommunitySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { name, slug, description, visibility } = parsed.data;
  const supabase = createServiceRoleClient();

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      name,
      slug,
      description: description || null,
      visibility,
      creator_address: normalizeAddress(session.sub),
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return conflict("A community with that slug already exists");
    }
    console.error("create community error", error);
    return serverError("Could not create community");
  }
  if (!community) {
    return serverError("Could not create community");
  }

  // The creator is automatically the owner.
  const { error: memberError } = await supabase
    .from("community_members")
    .insert({
      community_id: community.id,
      address: normalizeAddress(session.sub),
      role: "owner",
    });

  if (memberError) {
    // Roll back the community so we never leave one without an owner.
    await supabase.from("communities").delete().eq("id", community.id);
    console.error("owner membership error", memberError);
    return serverError("Could not create community");
  }

  await writeAuditLog({
    actor: session.sub,
    action: "community.create",
    entityType: "community",
    entityId: community.id,
    communityId: community.id,
    metadata: { slug, visibility },
  });

  await emitWebhookEvent({
    event: "community.created",
    communityId: community.id,
    data: {
      communityId: community.id,
      slug: community.slug,
      name: community.name,
      visibility: community.visibility,
    },
  });

  return created(serializeCommunity(community, "owner"));
}
