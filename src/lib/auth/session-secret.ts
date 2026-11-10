/** Minimum length for `SESSION_SECRET`, enforced before a session is minted. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Whether a usable session secret is configured. Kept pure (no `next/headers`
 * or alias imports) so it can be unit tested; callers may inject a value.
 */
export function isSessionSecretConfigured(
  secret: string | undefined = process.env.SESSION_SECRET,
): boolean {
  return Boolean(secret && secret.length >= MIN_SESSION_SECRET_LENGTH);
}
