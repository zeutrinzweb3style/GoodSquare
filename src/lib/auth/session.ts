import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { parseAuthorizationHeader } from "@/lib/developer/api-keys";
import { authenticateApiKey } from "@/lib/developer/api-key-service";

export const SESSION_COOKIE = "gs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  /** Wallet address, lowercased. Acts as the user id. */
  sub: string;
  /** How the caller authenticated: the browser cookie, or a bearer API key. */
  via?: "cookie" | "api_key";
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(address: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  // Third-party integrations authenticate with a bearer API key. Prefer it
  // when present so an explicit key wins over a stale browser cookie.
  const authorization = (await headers()).get("authorization");
  const bearer = parseAuthorizationHeader(authorization);
  if (bearer) {
    const resolved = await authenticateApiKey(bearer);
    if (resolved) return { sub: resolved.owner, via: "api_key" };
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  return payload ? { ...payload, via: "cookie" } : null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
