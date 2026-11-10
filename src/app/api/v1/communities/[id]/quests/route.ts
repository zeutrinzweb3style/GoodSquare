import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getCommunityBySlugOrId,
  getRole,
  can,
  writeAuditLog,
} from "@/lib/community/service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { createQuestSchema } from "@/lib/validation/schemas";
import { listQuests } from "@/lib/quest/service";
import { normalizeQuestReward } from "@/lib/quest/reward";
import {
  badRequest,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** List quests for a community. Private communities require membership. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/quests">,
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");

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

    const status =
      statusParam === "draft" || statusParam === "active" || statusParam === "closed"
        ? statusParam
        : undefined;

    const quests = await listQuests(community.id, { status });
    return ok({ quests });
  } catch (error) {
    console.error("list quests error", error);
    return serverError("Could not load quests");
  }
}

/** Create a quest. Requires the quest:create permission. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/quests">,
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

  const parsed = createQuestSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "quest:create")) {
      return forbidden("You cannot create quests in this community");
    }

    const {
      title,
      description,
      category,
      requirements,
      rewardInfo,
      rewardTokenSymbol,
      rewardAmount,
      expReward,
      deadline,
      status,
      verifiedOnly,
    } = parsed.data;

    const reward = normalizeQuestReward(rewardTokenSymbol, rewardAmount);
    if (!reward.ok) {
      return badRequest(reward.reason);
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("quests")
      .insert({
        community_id: community.id,
        title,
        description: description || null,
        category,
        requirements: requirements || null,
        reward_info: rewardInfo || null,
        reward_token_symbol: reward.value?.token ?? null,
        reward_amount: reward.value?.amount ?? null,
        exp_reward: expReward,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status,
        verified_only: verifiedOnly,
        created_by: normalizeAddress(session.sub),
      })
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("create quest error", error);
      return serverError("Could not create quest");
    }

    await writeAuditLog({
      actor: session.sub,
      action: "quest.create",
      entityType: "quest",
      entityId: data?.id ?? null,
      communityId: community.id,
      metadata: { title, category },
    });

    return created(data);
  } catch (error) {
    console.error("create quest error", error);
    return serverError("Could not create quest");
  }
}
