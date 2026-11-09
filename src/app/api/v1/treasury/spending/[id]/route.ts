import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getRole } from "@/lib/community/service";
import { reviewSpendingProposalSchema } from "@/lib/validation/schemas";
import {
  SpendingError,
  approveSpendingProposal,
  getSpendingProposalById,
  getTreasuryById,
  listSpendingApprovals,
  listTreasurySigners,
  revokeSpendingApproval,
  reviewSpendingProposal,
} from "@/lib/treasury/service";
import { approvalProgress } from "@/lib/treasury/approvals";
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
 * The approval state of a spending proposal: who has approved and how many
 * more are needed.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/treasury/spending/[id]">,
) {
  const { id } = await ctx.params;
  try {
    const proposal = await getSpendingProposalById(id);
    if (!proposal) return notFound("Spending proposal not found");

    const treasury = await getTreasuryById(proposal.treasury_id);
    if (!treasury) return notFound("Treasury not found");

    const signers = await listTreasurySigners(treasury.id);
    const approvals = await listSpendingApprovals(proposal.id);
    const progress = approvalProgress({
      signers: signers.map((signer) => signer.address),
      approvals,
      threshold: treasury.approval_threshold,
    });

    return ok({ approvals, signers, progress });
  } catch (error) {
    console.error("get spending approvals error", error);
    return serverError("Could not load approvals");
  }
}

/**
 * Approve, reject, or cancel a spending proposal. Requires treasury:spend.
 *
 * When the treasury has named signers, "approved" records one signer's approval
 * and only flips the proposal to `approved` once the threshold is reached. No
 * path here moves funds; a signer must still execute on-chain.
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

    const treasury = await getTreasuryById(proposal.treasury_id);
    if (!treasury) return notFound("Treasury not found");

    const decision = parsed.data.decision;

    // With named signers, approval is a threshold vote, not a single action.
    if (decision === "approved") {
      const signers = await listTreasurySigners(treasury.id);
      if (signers.length > 0) {
        const updated = await approveSpendingProposal({
          proposal,
          treasury,
          actor: session.sub,
        });
        return ok(updated);
      }
    }

    const updated = await reviewSpendingProposal(proposal, decision, session.sub);
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

/** Withdraw the caller's own approval from a pending proposal. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/treasury/spending/[id]">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  try {
    const proposal = await getSpendingProposalById(id);
    if (!proposal) return notFound("Spending proposal not found");

    const role = await getRole(proposal.community_id, session.sub);
    if (!can(role, "treasury:spend")) {
      return forbidden("You cannot manage treasury spending");
    }

    await revokeSpendingApproval({ proposal, actor: session.sub });
    return ok({ revoked: true });
  } catch (error) {
    if (error instanceof SpendingError) {
      if (error.code === "conflict") return conflict(error.message);
      if (error.code === "not-found") return notFound(error.message);
      return badRequest(error.message);
    }
    console.error("revoke spending approval error", error);
    return serverError("Could not revoke the approval");
  }
}
