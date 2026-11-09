import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import {
  PaymentError,
  cancelPaymentRequest,
  getPaymentRequestById,
} from "@/lib/pay/service";
import { getToken } from "@/lib/treasury/tokens";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "@/lib/api/response";

/**
 * A single payment request, with the token details needed to render a pay link.
 * Requests tied to a private community require membership; others are
 * link-accessible so a payee can share them.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/payment-requests/[id]">,
) {
  const { id } = await ctx.params;

  try {
    const paymentRequest = await getPaymentRequestById(id);
    if (!paymentRequest) return notFound("Payment request not found");

    if (paymentRequest.community_id) {
      const community = await getCommunityBySlugOrId(paymentRequest.community_id);
      if (!community) return notFound("Payment request not found");

      const session = await getSession();
      const role = await getRole(community.id, session?.sub);
      if (community.visibility === "private" && !role) {
        return notFound("Payment request not found");
      }
    }

    const token = getToken(paymentRequest.chain_id, paymentRequest.token_symbol);
    return ok({ request: paymentRequest, token });
  } catch (error) {
    console.error("get payment request error", error);
    return serverError("Could not load the payment request");
  }
}

/** Cancel an open request. The creator or a community manager may cancel. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/payment-requests/[id]">,
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

  if ((body as { status?: unknown })?.status !== "cancelled") {
    return badRequest("Only status=cancelled is supported");
  }

  try {
    const paymentRequest = await getPaymentRequestById(id);
    if (!paymentRequest) return notFound("Payment request not found");

    const isCreator = paymentRequest.created_by === session.sub;
    let isManager = false;
    if (paymentRequest.community_id) {
      const role = await getRole(paymentRequest.community_id, session.sub);
      isManager = can(role, "payment:create");
    }
    if (!isCreator && !isManager) {
      return forbidden("You cannot cancel this payment request");
    }

    const cancelled = await cancelPaymentRequest(paymentRequest, session.sub);
    return ok(cancelled);
  } catch (error) {
    if (error instanceof PaymentError) {
      if (error.code === "conflict") return conflict(error.message);
      if (error.code === "not-found") return notFound(error.message);
      return badRequest(error.message);
    }
    console.error("cancel payment request error", error);
    return serverError("Could not cancel the payment request");
  }
}
