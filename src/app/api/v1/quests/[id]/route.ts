import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getQuestById } from "@/lib/quest/service";
import { normalizeQuestReward } from "@/lib/quest/reward";
import { updateQuestSchema } from "@/lib/validation/schemas";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** Quest detail. Private community quests require membership. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/quests/[id]">,
) {
  const { id } = await ctx.params;

  try {
    const quest = await getQuestById(id);
    if (!quest) {
      return notFound("Quest not found");
    }

    const community = await getCommunityBySlugOrId(quest.community_id);
    if (!community) {
      return notFound("Quest not found");
    }

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Quest not found");
    }

    return ok({ quest, community: { id: community.id, slug: community.slug, name: community.name } });
  } catch (error) {
    console.error("get quest error", error);
    return serverError("Could not load quest");
  }
}

/** Update a quest. Requires the quest:create permission. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/quests/[id]">,
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

  const parsed = updateQuestSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const quest = await getQuestById(id);
    if (!quest) {
      return notFound("Quest not found");
    }

    const role = await getRole(quest.community_id, session.sub);
    if (!can(role, "quest:create")) {
      return forbidden("You cannot edit quests in this community");
    }

    const patch: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description || null;
    if (d.category !== undefined) patch.category = d.category;
    if (d.requirements !== undefined) patch.requirements = d.requirements || null;
    if (d.rewardInfo !== undefined) patch.reward_info = d.rewardInfo || null;
    if (d.rewardTokenSymbol !== undefined || d.rewardAmount !== undefined) {
      const reward = normalizeQuestReward(
        d.rewardTokenSymbol !== undefined
          ? d.rewardTokenSymbol
          : quest.reward_token_symbol,
        d.rewardAmount !== undefined ? d.rewardAmount : quest.reward_amount,
      );
      if (!reward.ok) {
        return badRequest(reward.reason);
      }
      patch.reward_token_symbol = reward.value?.token ?? null;
      patch.reward_amount = reward.value?.amount ?? null;
    }
    if (d.expReward !== undefined) patch.exp_reward = d.expReward;
    if (d.deadline !== undefined) {
      patch.deadline = d.deadline ? new Date(d.deadline).toISOString() : null;
    }
    if (d.status !== undefined) patch.status = d.status;

    if (Object.keys(patch).length === 0) {
      return badRequest("No fields to update");
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("quests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("update quest error", error);
      return serverError("Could not update quest");
    }

    return ok(data);
  } catch (error) {
    console.error("update quest error", error);
    return serverError("Could not update quest");
  }
}
