import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { createPaymentRequestSchema } from "@/lib/validation/schemas";
import {
  createPaymentRequest,
  listPaymentRequests,
} from "@/lib/pay/service";
import { defaultChainId, getToken, isPayable } from "@/lib/treasury/tokens";
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

/**
 * List payment requests. Without a filter, this returns the caller's own
 * requests (created or payable to them). A community filter returns that
 * community's requests for members of public communities.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const params = new URL(request.url).searchParams;
  const communityParam = params.get("communityId");
  const statusParam = params.get("status");
  const status =
    statusParam === "open" || statusParam === "paid" || statusParam === "cancelled"
      ? statusParam
      : undefined;

  try {
    if (communityParam) {
      const community = await getCommunityBySlugOrId(communityParam);
      if (!community) return notFound("Community not found");

      const role = await getRole(community.id, session.sub);
      if (community.visibility === "private" && !role) {
        return notFound("Community not found");
      }

      const requests = await listPaymentRequests({
        communityId: community.id,
        status,
      });
      return ok({ requests });
    }

    const [created, payable] = await Promise.all([
      listPaymentRequests({ createdBy: session.sub, status }),
      listPaymentRequests({ payee: session.sub, status }),
    ]);

    const merged = new Map<string, (typeof created)[number]>();
    for (const request of [...created, ...payable]) {
      merged.set(request.id, request);
    }

    return ok({ requests: [...merged.values()] });
  } catch (error) {
    console.error("list payment requests error", error);
    return serverError("Could not load payment requests");
  }
}

/** Create a payment request payable to the caller's wallet. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = createPaymentRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const chainId = defaultChainId();
    const { tokenSymbol } = parsed.data;
    if (!isPayable(chainId, tokenSymbol)) {
      return badRequest("That token is not supported");
    }
    const token = getToken(chainId, tokenSymbol)!;

    const amount = parseAmount(parsed.data.amount, token.decimals);
    if (amount === null || amount <= 0n) {
      return badRequest(
        `Enter a valid ${token.symbol} amount with at most ${token.decimals} decimals`,
      );
    }

    let communityId: string | null = null;
    if (parsed.data.communityId) {
      const community = await getCommunityBySlugOrId(parsed.data.communityId);
      if (!community) return notFound("Community not found");

      const role = await getRole(community.id, session.sub);
      if (!can(role, "payment:create")) {
        return forbidden("You cannot create payment requests for this community");
      }
      communityId = community.id;
    }

    const paymentRequest = await createPaymentRequest({
      communityId,
      createdBy: session.sub,
      chainId,
      tokenSymbol,
      amount: amount.toString(),
      memo: parsed.data.memo || null,
    });

    return created(paymentRequest);
  } catch (error) {
    console.error("create payment request error", error);
    return serverError("Could not create the payment request");
  }
}
