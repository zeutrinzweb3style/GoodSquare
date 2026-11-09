import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidAddress, normalizeAddress } from "@/lib/auth/wallet";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import {
  getReputationHistory,
  getReputationSummary,
  recordReputationEvent,
} from "@/lib/reputation/service";
import { listUserBadges } from "@/lib/reputation/badges";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { awardReputationSchema } from "@/lib/validation/schemas";
import { levelForExp } from "@/lib/reputation/levels";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/**
 * Square Reputation for a wallet.
 *
 * Reputation is community-specific by default. Pass `?community=<id|slug>` to
 * scope the result to one community; without it we aggregate EXP across every
 * community the wallet has earned in.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/reputation/[wallet]">,
) {
  const { wallet } = await ctx.params;
  if (!isValidAddress(wallet)) {
    return badRequest("A valid wallet address is required");
  }
  const address = normalizeAddress(wallet);
  const url = new URL(request.url);
  const communityParam = url.searchParams.get("community");

  try {
    if (communityParam) {
      const community = await getCommunityBySlugOrId(communityParam);
      if (!community) {
        return notFound("Community not found");
      }

      const session = await getSession();
      const role = await getRole(community.id, session?.sub);
      if (community.visibility === "private" && !role) {
        return notFound("Community not found");
      }

      const summary = await getReputationSummary(community.id, address);
      const [history, badges] = await Promise.all([
        getReputationHistory(community.id, address),
        listUserBadges(address, community.id),
      ]);

      return ok({
        scope: "community",
        community: {
          id: community.id,
          slug: community.slug,
          name: community.name,
        },
        ...summary,
        history,
        badges,
      });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("community_reputation")
      .select("community_id, exp, event_count, last_event_at")
      .eq("address", address);

    if (error) {
      console.error("reputation lookup error", error);
      return serverError("Could not load reputation");
    }

    const exp = (data ?? []).reduce((sum, row) => sum + row.exp, 0);
    const badges = await listUserBadges(address);

    return ok({
      scope: "global",
      address,
      exp,
      level: levelForExp(exp),
      communities: (data ?? []).map((row) => ({
        community_id: row.community_id,
        exp: row.exp,
        event_count: row.event_count,
        last_event_at: row.last_event_at,
      })),
      badges,
    });
  } catch (error) {
    console.error("reputation error", error);
    return serverError("Could not load reputation");
  }
}

/**
 * Manually adjust a wallet's EXP in a community. Requires the reputation:award
 * permission. Every adjustment is recorded as an auditable ledger event.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/reputation/[wallet]">,
) {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const { wallet } = await ctx.params;
  if (!isValidAddress(wallet)) {
    return badRequest("A valid wallet address is required");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const communityId = (body as { community?: unknown })?.community;
  if (typeof communityId !== "string" || communityId.length === 0) {
    return badRequest("A community id or slug is required");
  }

  const parsed = awardReputationSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const community = await getCommunityBySlugOrId(communityId);
    if (!community) {
      return notFound("Community not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "reputation:award")) {
      return forbidden("You cannot award reputation in this community");
    }

    await recordReputationEvent({
      communityId: community.id,
      address: normalizeAddress(wallet),
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      sourceType: "manual",
      createdBy: session.sub,
    });

    const summary = await getReputationSummary(
      community.id,
      normalizeAddress(wallet),
    );
    return ok(summary);
  } catch (error) {
    console.error("award reputation error", error);
    return serverError("Could not award reputation");
  }
}
