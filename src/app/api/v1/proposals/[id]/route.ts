import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getCommunityBySlugOrId,
  getRole,
  can,
} from "@/lib/community/service";
import { updateProposalStatusSchema } from "@/lib/validation/schemas";
import {
  computeProposalOutcome,
  getProposalById,
  updateProposalStatus,
} from "@/lib/governance/service";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** Proposal detail with its current tally and resolution. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/proposals/[id]">,
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

    return ok({ proposal, results, tally, eligible });
  } catch (error) {
    console.error("get proposal error", error);
    return serverError("Could not load proposal");
  }
}

/** Open, close, or cancel a proposal. Requires proposal:manage. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/proposals/[id]">,
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

  const parsed = updateProposalStatusSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const proposal = await getProposalById(id);
    if (!proposal) {
      return notFound("Proposal not found");
    }

    const role = await getRole(proposal.community_id, session.sub);
    if (!can(role, "proposal:manage")) {
      return forbidden("You cannot manage proposals in this community");
    }

    const updated = await updateProposalStatus(
      proposal,
      parsed.data.status,
      session.sub,
    );
    return ok(updated);
  } catch (error) {
    console.error("update proposal error", error);
    return serverError("Could not update proposal");
  }
}
