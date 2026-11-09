import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import {
  computeProposalOutcome,
  getProposalById,
  listVotes,
} from "@/lib/governance/service";
import { notFound, ok, serverError } from "@/lib/api/response";
import { votingPhase } from "@/lib/governance/results";

/** Tally, resolution, and vote history for a proposal. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/proposals/[id]/results">,
) {
  const { id } = await ctx.params;

  try {
    const proposal = await getProposalById(id);
    if (!proposal) {
      return notFound("Proposal not found");
    }

    const community = await getCommunityBySlugOrId(proposal.community_id);
    if (!community) {
      return notFound("Proposal not found");
    }

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Proposal not found");
    }

    const { results, tally, eligible } =
      await computeProposalOutcome(proposal);
    const votes = await listVotes(proposal.id);

    return ok({
      proposal_id: proposal.id,
      status: proposal.status,
      phase: votingPhase(proposal),
      results,
      tally,
      eligible,
      votes,
    });
  } catch (error) {
    console.error("proposal results error", error);
    return serverError("Could not load proposal results");
  }
}
