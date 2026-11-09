import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getRole,
} from "@/lib/community/service";
import { executeSpendingProposalSchema } from "@/lib/validation/schemas";
import {
  SpendingError,
  executeSpendingProposal,
  getSpendingProposalById,
  getTreasuryById,
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
 * Record that an approved spend was sent on-chain. Requires treasury:spend.
 * The caller must have already sent the transaction from the treasury wallet;
 * the backend verifies the receipt against the approved terms before recording.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/treasury/spending/[id]/execute">,
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

  const parsed = executeSpendingProposalSchema.safeParse(body);
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

    const executed = await executeSpendingProposal(
      proposal,
      treasury,
      parsed.data.txHash,
      session.sub,
    );
    return ok(executed);
  } catch (error) {
    if (error instanceof SpendingError) {
      if (error.code === "conflict") return conflict(error.message);
      if (error.code === "not-found") return notFound(error.message);
      return badRequest(error.message);
    }
    console.error("execute spending proposal error", error);
    return serverError("Could not record the execution");
  }
}
