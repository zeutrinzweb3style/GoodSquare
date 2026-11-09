import { getAddress, isAddress } from "viem";

/**
 * Wallet addresses are stored lowercase for reliable database comparison
 * (EIP-55 checksum casing is only for display).
 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isValidAddress(address: string): boolean {
  return isAddress(address, { strict: false });
}

/** Returns the EIP-55 checksummed address for display, or the input on failure. */
export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}
