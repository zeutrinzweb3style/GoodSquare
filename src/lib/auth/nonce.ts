import { randomUUID } from "crypto";

export const AUTH_NONCE_TTL_SECONDS = 5 * 60;

export function generateNonce(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * The exact human-readable message a wallet must sign to authenticate.
 * The nonce binds the signature to a single login attempt, and the timestamp
 * limits how long a captured signature stays useful.
 */
export function buildSiweMessage({
  domain,
  address,
  nonce,
  issuedAt,
}: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${domain} wants you to sign in with your Celo account:`,
    address,
    "",
    "Sign this message to authenticate with Good Square. This request will not trigger a blockchain transaction or cost any gas.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}
