import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getRole,
} from "@/lib/community/service";
import { reviewSpendingProposalSchema } from "@/lib/validation/schemas";
import {
  SpendingError,
  getSpendingProposalById,
  reviewSpendingProposal,
} from "@/lib/treasury/service";
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

/**
 * Approve, reject, or cancel a spending proposal. Requires treasury:spend.
 * Approving does not move any funds; a signer must still execute on-chain.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/treasury/spending/[id]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = reviewSpendingProposalSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const proposal = await getSpendingProposalById(id);
    if (!proposal) return notFound("Spending proposal not found");

    const role = await getRole(proposal.community_id, session.sub);
    if (!can(role, "treasury:spend")) {
      return forbidden("You cannot manage treasury spending");
    }

    const updated = await reviewSpendingProposal(
      proposal,
      parsed.data.decision,
      session.sub,
    );
    return ok(updated);
  } catch (error) {
    if (error instanceof SpendingError) {
      if (error.code === "conflict") return conflict(error.message);
      if (error.code === "not-found") return notFound(error.message);
      return badRequest(error.message);
    }
    console.error("review spending proposal error", error);
    return serverError("Could not update the spending proposal");
  }
}
