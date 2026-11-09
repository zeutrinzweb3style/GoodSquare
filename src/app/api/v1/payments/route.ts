import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId } from "@/lib/community/service";
import { recordPaymentSchema } from "@/lib/validation/schemas";
import {
  PaymentError,
  getPaymentRequestById,
  listPayments,
  recordPayment,
} from "@/lib/pay/service";
import { defaultChainId, getToken, isPayable } from "@/lib/treasury/tokens";
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

/** List payments the caller made or received. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const [sent, received] = await Promise.all([
      listPayments({ payer: session.sub }),
      listPayments({ payee: session.sub }),
    ]);

    const merged = new Map<string, (typeof sent)[number]>();
    for (const payment of [...sent, ...received]) {
      merged.set(payment.id, payment);
    }

    return ok({ payments: [...merged.values()] });
  } catch (error) {
    console.error("list payments error", error);
    return serverError("Could not load payments");
  }
}

/**
 * Record a payment the caller already sent, wallet to wallet. If a request id is
 * supplied, the transfer is verified against that request's terms and the
 * request is marked paid. Good Square never holds or moves the funds.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    let communityId: string | null = null;
    if (parsed.data.communityId) {
      const community = await getCommunityBySlugOrId(parsed.data.communityId);
      if (!community) return notFound("Community not found");
      communityId = community.id;
    }

    const paymentRequest = parsed.data.paymentRequestId
      ? await getPaymentRequestById(parsed.data.paymentRequestId)
      : null;
    if (parsed.data.paymentRequestId && !paymentRequest) {
      return notFound("Payment request not found");
    }

    // The request's chain wins (it defines the expected token and amount),
    // then the community's treasury chain, then the app default.
    const chainId = paymentRequest?.chain_id ?? defaultChainId();

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

    const payment = await recordPayment({
      payer: session.sub,
      payeeAddress: parsed.data.payeeAddress,
      chainId,
      tokenSymbol,
      amount: amount.toString(),
      txHash: parsed.data.txHash,
      communityId,
      paymentRequest,
    });

    return created(payment);
  } catch (error) {
    if (error instanceof PaymentError) {
      if (error.code === "conflict") return conflict(error.message);
      if (error.code === "not-found") return notFound(error.message);
      if (error.code === "forbidden") return forbidden(error.message);
      return badRequest(error.message);
    }
    console.error("record payment error", error);
    return serverError("Could not record the payment");
  }
}
