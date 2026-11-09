import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { createSpendingProposalSchema } from "@/lib/validation/schemas";
import {
  createSpendingProposal,
  getTreasuryByCommunity,
  listSpendingProposals,
} from "@/lib/treasury/service";
import { getToken, isPayable } from "@/lib/treasury/tokens";
import { parseAmount } from "@/lib/treasury/amounts";
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
import type { SpendingStatus } from "@/lib/types";

/** List treasury spending proposals. Members only for private communities. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/spending">,
) {
  const { id } = await ctx.params;
  const statusParam = new URL(request.url).searchParams.get("status");

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const allowed: SpendingStatus[] = [
      "pending",
      "approved",
      "rejected",
      "executed",
      "cancelled",
    ];
    const status = allowed.includes(statusParam as SpendingStatus)
      ? (statusParam as SpendingStatus)
      : undefined;

    const proposals = await listSpendingProposals(community.id, { status });
    return ok({ proposals });
  } catch (error) {
    console.error("list spending proposals error", error);
    return serverError("Could not load spending proposals");
  }
}

/** Propose a spend from the treasury. Requires treasury:spend. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/spending">,
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

  const parsed = createSpendingProposalSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:spend")) {
      return forbidden("You cannot propose treasury spending");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");
    if (!treasury.is_active) {
      return badRequest("The treasury is not active");
    }

    const { tokenSymbol } = parsed.data;
    if (!isPayable(treasury.chain_id, tokenSymbol)) {
      return badRequest("That token is not supported on this treasury's network");
    }
    const token = getToken(treasury.chain_id, tokenSymbol)!;

    const amount = parseAmount(parsed.data.amount, token.decimals);
    if (amount === null) {
      return badRequest(
        `Enter a valid ${token.symbol} amount with at most ${token.decimals} decimals`,
      );
    }
    if (amount <= 0n) {
      return badRequest("Amount must be greater than zero");
    }

    const proposal = await createSpendingProposal({
      treasury,
      title: parsed.data.title,
      description: parsed.data.description || null,
      tokenSymbol,
      amount: amount.toString(),
      recipient: parsed.data.recipient,
      proposalId: parsed.data.proposalId || null,
      proposedBy: session.sub,
    });

    return created(proposal);
  } catch (error) {
    console.error("create spending proposal error", error);
    return serverError("Could not create the spending proposal");
  }
}
