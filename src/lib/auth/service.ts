import { verifyMessage } from "viem";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  AUTH_NONCE_TTL_SECONDS,
  buildSiweMessage,
  generateNonce,
} from "@/lib/auth/nonce";
import { isValidAddress, normalizeAddress } from "@/lib/auth/wallet";

export interface NonceRecord {
  address: string;
  nonce: string;
  message: string;
  issuedAt: string;
}

/** Issues a fresh single-use nonce and the exact message to sign. */
export async function issueNonce(
  addressInput: string,
  domain: string,
): Promise<NonceRecord> {
  if (!isValidAddress(addressInput)) {
    throw new AuthError("INVALID_ADDRESS", "A valid wallet address is required");
  }

  const address = normalizeAddress(addressInput);
  const nonce = generateNonce();
  const issuedAt = new Date().toISOString();
  const message = buildSiweMessage({ domain, address, nonce, issuedAt });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("auth_nonces").insert({
    address,
    nonce,
    message,
  });
  if (error) {
    throw new AuthError("NONCE_STORE_FAILED", "Could not create a login nonce");
  }

  return { address, nonce, message, issuedAt };
}

/**
 * Verifies a signed login message. Checks, in order:
 * 1. the address format,
 * 2. that a matching, unexpired, unused nonce exists,
 * 3. that the signature recovers to the claimed address.
 * The nonce is consumed only after a successful signature check.
 */
export async function verifyLogin(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<string> {
  const { address: addressInput, message, signature } = params;

  if (!isValidAddress(addressInput)) {
    throw new AuthError("INVALID_ADDRESS", "A valid wallet address is required");
  }
  const address = normalizeAddress(addressInput);

  if (typeof message !== "string" || typeof signature !== "string") {
    throw new AuthError("INVALID_PAYLOAD", "Message and signature are required");
  }

  const supabase = createServiceRoleClient();

  const { data: nonceRow, error: nonceError } = await supabase
    .from("auth_nonces")
    .select("id, address, message, used_at, created_at")
    .eq("address", address)
    .eq("message", message)
    .maybeSingle();

  if (nonceError) {
    throw new AuthError("NONCE_LOOKUP_FAILED", "Could not verify login nonce");
  }
  if (!nonceRow) {
    throw new AuthError("NONCE_NOT_FOUND", "Login nonce was not found");
  }
  if (nonceRow.used_at) {
    throw new AuthError("NONCE_USED", "This login attempt was already used");
  }

  const ageSeconds =
    (Date.now() - new Date(nonceRow.created_at).getTime()) / 1000;
  if (ageSeconds > AUTH_NONCE_TTL_SECONDS) {
    throw new AuthError("NONCE_EXPIRED", "This login attempt has expired");
  }

  // Belt-and-suspenders: the stored message is the source of truth, so make
  // sure the client sent back exactly what we issued before verifying it.
  if (message !== nonceRow.message) {
    throw new AuthError("MESSAGE_MISMATCH", "Signed message did not match");
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new AuthError("BAD_SIGNATURE", "Signature verification failed");
  }

  await supabase
    .from("auth_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("id", nonceRow.id);

  return address;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
