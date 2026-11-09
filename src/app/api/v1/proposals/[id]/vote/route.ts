import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { castVoteSchema } from "@/lib/validation/schemas";
import {
  VoteError,
  castVote,
  getProposalById,
  isEligibleVoter,
} from "@/lib/governance/service";
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

/** Cast a vote. One vote per wallet per proposal (one-wallet-one-vote). */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/proposals/[id]/vote">,
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

  const parsed = castVoteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const proposal = await getProposalById(id);
    if (!proposal) {
      return notFound("Proposal not found");
    }

    const community = await getCommunityBySlugOrId(proposal.community_id);
    if (!community) {
      return notFound("Proposal not found");
    }

    const role = await getRole(community.id, session.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Proposal not found");
    }

    if (!isEligibleVoter(role, proposal.voter_role)) {
      return forbidden(
        `Only ${proposal.voter_role} members and above can vote on this proposal`,
      );
    }

    const vote = await castVote({
      proposal,
      address: session.sub,
      choice: parsed.data.choice,
      reason: parsed.data.reason || null,
    });

    return ok(vote);
  } catch (error) {
    if (error instanceof VoteError) {
      if (error.code === "duplicate") {
        return conflict(error.message);
      }
      return forbidden(error.message);
    }
    console.error("cast vote error", error);
    return serverError("Could not cast vote");
  }
}
