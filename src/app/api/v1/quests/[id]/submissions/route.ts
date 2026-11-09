import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import {
  createSubmission,
  getQuestById,
  getSubmission,
  listSubmissions,
} from "@/lib/quest/service";
import { submitQuestProofSchema } from "@/lib/validation/schemas";
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

/**
 * List submissions for a quest. Members see only their own; moderators and
 * above see every submission.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/quests/[id]/submissions">,
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");

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

    const status =
      statusParam === "pending" ||
      statusParam === "approved" ||
      statusParam === "rejected"
        ? statusParam
        : undefined;

    if (can(role, "quest:moderate")) {
      const submissions = await listSubmissions(quest.id, { status });
      return ok({ submissions });
    }

    if (!session) {
      return unauthorized();
    }
    const mine = await getSubmission(quest.id, session.sub);
    return ok({ submissions: mine ? [mine] : [] });
  } catch (error) {
    console.error("list submissions error", error);
    return serverError("Could not load submissions");
  }
}

/** Submit proof of completion. One submission per member per quest. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/quests/[id]/submissions">,
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

  const parsed = submitQuestProofSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const quest = await getQuestById(id);
    if (!quest) {
      return notFound("Quest not found");
    }

    const community = await getCommunityBySlugOrId(quest.community_id);
    if (!community) {
      return notFound("Quest not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!role) {
      return forbidden("Join this community before submitting a quest");
    }
    if (quest.status !== "active") {
      return forbidden("This quest is not accepting submissions");
    }
    if (quest.deadline && new Date(quest.deadline).getTime() < Date.now()) {
      return forbidden("The deadline for this quest has passed");
    }

    const existing = await getSubmission(quest.id, session.sub);
    if (existing) {
      return conflict("You have already submitted proof for this quest");
    }

    const submission = await createSubmission({
      quest,
      address: session.sub,
      proofUrl: parsed.data.proofUrl || null,
      proofText: parsed.data.proofText || null,
    });

    return created(submission);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      return conflict("You have already submitted proof for this quest");
    }
    console.error("submit proof error", error);
    return serverError("Could not submit proof");
  }
}
