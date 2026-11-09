import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRole, can } from "@/lib/community/service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { reviewSubmission } from "@/lib/quest/service";
import { reviewSubmissionSchema } from "@/lib/validation/schemas";
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

/** Approve or reject a submission. Requires the quest:moderate permission. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/submissions/[id]/review">,
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

  const parsed = reviewSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: submission, error } = await supabase
      .from("quest_submissions")
      .select("id, community_id, status")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("load submission error", error);
      return serverError("Could not load submission");
    }
    if (!submission) {
      return notFound("Submission not found");
    }

    const role = await getRole(submission.community_id, session.sub);
    if (!can(role, "quest:moderate")) {
      return forbidden("You cannot review submissions in this community");
    }
    if (submission.status !== "pending") {
      return conflict("This submission has already been reviewed");
    }

    const result = await reviewSubmission({
      submissionId: id,
      reviewer: session.sub,
      decision: parsed.data.decision,
      note: parsed.data.note || null,
    });

    if (!result.submission) {
      return conflict("This submission has already been reviewed");
    }

    return ok({
      submission: result.submission,
      exp_awarded:
        parsed.data.decision === "approved" ? (result.quest?.exp_reward ?? 0) : 0,
    });
  } catch (error) {
    console.error("review submission error", error);
    return serverError("Could not review submission");
  }
}
