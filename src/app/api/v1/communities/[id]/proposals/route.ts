import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { createProposalSchema } from "@/lib/validation/schemas";
import { createProposal, listProposals } from "@/lib/governance/service";
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
import type { ProposalStatus } from "@/lib/types";

/** List proposals for a community. Private communities require membership. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/proposals">,
) {
  const { id } = await ctx.params;
  const statusParam = new URL(request.url).searchParams.get("status");

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

    const allowed: ProposalStatus[] = ["draft", "active", "closed", "cancelled"];
    const status = allowed.includes(statusParam as ProposalStatus)
      ? (statusParam as ProposalStatus)
      : undefined;

    const proposals = await listProposals(community.id, { status });
    return ok({ proposals });
  } catch (error) {
    console.error("list proposals error", error);
    return serverError("Could not load proposals");
  }
}

/** Create a proposal. Requires the proposal:create permission. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/proposals">,
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

  const parsed = createProposalSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) {
      return notFound("Community not found");
    }

    const role = await getRole(community.id, session.sub);
    if (!can(role, "proposal:create")) {
      return forbidden("You cannot create proposals in this community");
    }

    const data = parsed.data;
    const proposal = await createProposal({
      communityId: community.id,
      title: data.title,
      description: data.description || null,
      votingStartsAt: data.votingStartsAt
        ? new Date(data.votingStartsAt).toISOString()
        : null,
      votingEndsAt: data.votingEndsAt
        ? new Date(data.votingEndsAt).toISOString()
        : null,
      voterRole: data.voterRole,
      quorumPercent: data.quorumPercent,
      approvalThreshold: data.approvalThreshold,
      status: data.status,
      createdBy: session.sub,
    });

    return created(proposal);
  } catch (error) {
    console.error("create proposal error", error);
    return serverError("Could not create proposal");
  }
}
