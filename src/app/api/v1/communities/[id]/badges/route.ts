import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { createBadge, listBadges } from "@/lib/reputation/badges";
import { createBadgeSchema } from "@/lib/validation/schemas";
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** List a community's badge definitions. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/badges">,
) {
  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const badges = await listBadges(community.id);
    return ok({ badges });
  } catch (error) {
    console.error("list badges error", error);
    return serverError("Could not load badges");
  }
}

/** Create a badge definition. Requires the reputation:award permission. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/badges">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "reputation:award")) {
      return forbidden("You cannot manage badges in this community");
    }

    const badge = await createBadge({
      communityId: community.id,
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      icon: parsed.data.icon || null,
      createdBy: session.sub,
    });

    return created(badge);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return conflict("A badge with that slug already exists");
    }
    console.error("create badge error", error);
    return serverError("Could not create badge");
  }
}
