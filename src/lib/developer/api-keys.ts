import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API key format and hashing. Kept I/O-free so it can be unit tested directly.
 *
 * A key looks like `gs_live_<prefix>_<secret>`. The prefix is a short,
 * non-secret identifier stored in the database for lookup; the secret is
 * random and is only ever stored as a SHA-256 hash.
 */

export const API_KEY_PREFIX = "gs";
export const API_KEY_ENVIRONMENTS = ["live", "test"] as const;
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number];

const PREFIX_BYTES = 4; // 8 hex characters
const SECRET_BYTES = 24; // 48 hex characters

export interface GeneratedApiKey {
  /** The full key. Returned to the caller once and never stored. */
  key: string;
  /** Short identifier stored for lookup, e.g. `gs_live_a1b2c3d4`. */
  prefix: string;
  /** SHA-256 hex digest of the full key. */
  hash: string;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Builds a key from an environment, a random prefix, and a random secret. */
export function generateApiKey(
  environment: ApiKeyEnvironment = "live",
): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  const key = `${API_KEY_PREFIX}_${environment}_${prefix}_${secret}`;
  return {
    key,
    prefix: `${API_KEY_PREFIX}_${environment}_${prefix}`,
    hash: hashApiKey(key),
  };
}

/** Extracts the stored prefix from a presented key, or null if malformed. */
export function keyPrefix(key: string): string | null {
  const parts = key.split("_");
  if (parts.length !== 4) return null;
  const [api, environment, prefix, secret] = parts;
  if (api !== API_KEY_PREFIX) return null;
  if (!API_KEY_ENVIRONMENTS.includes(environment as ApiKeyEnvironment)) {
    return null;
  }
  if (!/^[0-9a-f]{8}$/.test(prefix)) return null;
  if (!/^[0-9a-f]{48}$/.test(secret)) return null;
  return `${api}_${environment}_${prefix}`;
}

export function isApiKeyFormat(key: string): boolean {
  return keyPrefix(key) !== null;
}

/**
 * Constant-time comparison of a presented key's hash against a stored hash.
 * Hashing first means the inputs are always the same length, so the comparison
 * leaks nothing about where the digests differ.
 */
export function apiKeyMatches(presented: string, storedHash: string): boolean {
  const presentedHash = Buffer.from(hashApiKey(presented), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (presentedHash.length !== stored.length) return false;
  return timingSafeEqual(presentedHash, stored);
}

/** Extracts a bearer key from an Authorization header value. */
export function parseAuthorizationHeader(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const key = match[1].trim();
  return key.length > 0 ? key : null;
}
