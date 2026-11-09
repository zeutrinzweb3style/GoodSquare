import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import { writeAuditLog } from "@/lib/community/service";
import { canFulfillRequest } from "@/lib/pay/status";
import { verifyTransfer } from "@/lib/treasury/verify";
import { notify } from "@/lib/notifications/service";
import type { Payment, PaymentRequest } from "@/lib/types";

export async function getPaymentRequestById(
  id: string,
): Promise<PaymentRequest | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listPaymentRequests(
  options: {
    communityId?: string;
    createdBy?: string;
    payee?: string;
    status?: PaymentRequest["status"];
    limit?: number;
  } = {},
): Promise<PaymentRequest[]> {
  const { limit = 50 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.communityId) query = query.eq("community_id", options.communityId);
  if (options.createdBy) {
    query = query.eq("created_by", normalizeAddress(options.createdBy));
  }
  if (options.payee) {
    query = query.eq("payee_address", normalizeAddress(options.payee));
  }
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createPaymentRequest(input: {
  communityId?: string | null;
  createdBy: string;
  chainId: number;
  tokenSymbol: string;
  /** Amount in base units. */
  amount: string;
  memo?: string | null;
}): Promise<PaymentRequest> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      community_id: input.communityId || null,
      created_by: normalizeAddress(input.createdBy),
      payee_address: normalizeAddress(input.createdBy),
      chain_id: input.chainId,
      token_symbol: input.tokenSymbol,
      amount: input.amount,
      memo: input.memo || null,
    })
    .select("*")
    .single();

  if (error) throw error;

  await writeAuditLog({
    actor: normalizeAddress(input.createdBy),
    action: "payment_request.create",
    entityType: "payment_request",
    entityId: data.id,
    communityId: input.communityId || null,
    metadata: {
      token: input.tokenSymbol,
      amount: input.amount,
      chainId: input.chainId,
    },
  });

  return data;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid" | "not-found" | "forbidden",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function cancelPaymentRequest(
  request: PaymentRequest,
  actor: string,
): Promise<PaymentRequest> {
  if (request.status !== "open") {
    throw new PaymentError(
      `Cannot cancel a ${request.status} request`,
      "conflict",
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .update({ status: "cancelled" })
    .eq("id", request.id)
    .eq("status", "open")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new PaymentError("Request was already resolved", "conflict");
  }

  await writeAuditLog({
    actor: normalizeAddress(actor),
    action: "payment_request.cancel",
    entityType: "payment_request",
    entityId: request.id,
    communityId: request.community_id,
    metadata: {},
  });

  return data;
}

/**
 * Record a payment the payer already sent, wallet to wallet. When it fulfils a
 * request, the transfer is verified against the request's terms and the request
 * is marked paid in the same flow.
 */
export async function recordPayment(input: {
  payer: string;
  payeeAddress: string;
  chainId: number;
  tokenSymbol: string;
  /** Amount in base units. */
  amount: string;
  txHash: string;
  communityId?: string | null;
  paymentRequest?: PaymentRequest | null;
}): Promise<Payment> {
  if (input.paymentRequest) {
    const request = input.paymentRequest;
    if (!canFulfillRequest(request.status)) {
      throw new PaymentError(
        `This request is ${request.status}`,
        "conflict",
      );
    }
    if (normalizeAddress(request.payee_address) !== normalizeAddress(input.payeeAddress)) {
      throw new PaymentError("Payee does not match the request", "invalid");
    }
    if (request.token_symbol !== input.tokenSymbol) {
      throw new PaymentError("Token does not match the request", "invalid");
    }
    if (request.amount !== input.amount) {
      throw new PaymentError("Amount does not match the request", "invalid");
    }
  }

  const verified = await verifyTransfer({
    chainId: input.chainId,
    tokenSymbol: input.tokenSymbol,
    from: normalizeAddress(input.payer),
    to: normalizeAddress(input.payeeAddress),
    amount: BigInt(input.amount),
    txHash: input.txHash,
  });
  if (!verified.ok) {
    throw new PaymentError(
      verified.reason ?? "Transaction could not be verified",
      "invalid",
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      community_id: input.communityId || input.paymentRequest?.community_id || null,
      payment_request_id: input.paymentRequest?.id ?? null,
      payer_address: normalizeAddress(input.payer),
      payee_address: normalizeAddress(input.payeeAddress),
      chain_id: input.chainId,
      token_symbol: input.tokenSymbol,
      amount: input.amount,
      tx_hash: normalizeAddress(input.txHash),
      block_number: verified.blockNumber ? Number(verified.blockNumber) : null,
      status: "verified",
      verified_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new PaymentError("This transaction is already recorded", "conflict");
    }
    throw error;
  }

  if (input.paymentRequest) {
    await supabase
      .from("payment_requests")
      .update({
        status: "paid",
        paid_tx_hash: normalizeAddress(input.txHash),
        paid_by: normalizeAddress(input.payer),
        paid_at: new Date().toISOString(),
      })
      .eq("id", input.paymentRequest.id)
      .eq("status", "open");
  }

  await writeAuditLog({
    actor: normalizeAddress(input.payer),
    action: "payment.record",
    entityType: "payment",
    entityId: data.id,
    communityId: data.community_id,
    metadata: {
      token: input.tokenSymbol,
      amount: input.amount,
      txHash: input.txHash,
      requestId: input.paymentRequest?.id ?? null,
    },
  });

  // Tell the payee their request was paid, unless they paid it themselves.
  if (
    input.paymentRequest &&
    normalizeAddress(input.paymentRequest.payee_address) !==
      normalizeAddress(input.payer)
  ) {
    await notify({
      address: input.paymentRequest.payee_address,
      type: "payment.received",
      title: "Payment received",
      body: `Your payment request was paid in ${input.tokenSymbol}.`,
      entityType: "payment_request",
      entityId: input.paymentRequest.id,
      communityId: data.community_id,
    });
  }

  return data;
}

export async function listPayments(
  options: {
    payer?: string;
    payee?: string;
    communityId?: string;
    limit?: number;
  } = {},
): Promise<Payment[]> {
  const { limit = 50 } = options;
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.payer) query = query.eq("payer_address", normalizeAddress(options.payer));
  if (options.payee) query = query.eq("payee_address", normalizeAddress(options.payee));
  if (options.communityId) query = query.eq("community_id", options.communityId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
