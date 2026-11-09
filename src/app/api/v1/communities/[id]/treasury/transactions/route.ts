import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { recordTreasuryTransactionSchema } from "@/lib/validation/schemas";
import {
  SpendingError,
  getTreasuryByCommunity,
  listTreasuryTransactions,
  recordTreasuryTransaction,
} from "@/lib/treasury/service";
import { getToken, isPayable } from "@/lib/treasury/tokens";
import { parseAmount } from "@/lib/treasury/amounts";
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

/** List treasury transactions. Members only for private communities. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/transactions">,
) {
  const { id } = await ctx.params;

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return ok({ transactions: [] });

    const transactions = await listTreasuryTransactions(treasury.id);
    return ok({ transactions });
  } catch (error) {
    console.error("list treasury transactions error", error);
    return serverError("Could not load treasury transactions");
  }
}

/**
 * Record a transfer in or out of the treasury, after verifying the receipt.
 * Requires treasury:spend. Direction is inferred from which side is the
 * treasury address; the caller never declares it.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/transactions">,
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

  const parsed = recordTreasuryTransactionSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:spend")) {
      return forbidden("You cannot record treasury transactions");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");
    if (!treasury.address) {
      return badRequest("Set the treasury address before recording transfers");
    }

    const { tokenSymbol } = parsed.data;
    if (!isPayable(treasury.chain_id, tokenSymbol)) {
      return badRequest("That token is not supported on this treasury's network");
    }
    const token = getToken(treasury.chain_id, tokenSymbol)!;

    const amount = parseAmount(parsed.data.amount, token.decimals);
    if (amount === null || amount <= 0n) {
      return badRequest(
        `Enter a valid ${token.symbol} amount with at most ${token.decimals} decimals`,
      );
    }

    const transaction = await recordTreasuryTransaction({
      treasury,
      tokenSymbol,
      amount: amount.toString(),
      fromAddress: parsed.data.fromAddress,
      toAddress: parsed.data.toAddress,
      txHash: parsed.data.txHash,
      actor: session.sub,
    });

    return created(transaction);
  } catch (error) {
    if (error instanceof SpendingError) {
      if (error.code === "conflict") return conflict(error.message);
      return badRequest(error.message);
    }
    console.error("record treasury transaction error", error);
    return serverError("Could not record the transaction");
  }
}
