import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  DEFAULT_RATE_LIMIT,
  WRITE_RATE_LIMIT,
  type RateLimitRule,
} from "@/lib/developer/rate-limit";
import { consume, headersFor, clientIdentifier } from "@/lib/developer/rate-limit-store";

/**
 * Rate-limits the versioned public API. Anonymous callers are bucketed by IP
 * and API-key callers by their bearer token, so an integration gets its own
 * budget. Reads and writes use different limits.
 */
function rateLimitApi(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/v1")) return null;

  const isWrite = request.method !== "GET" && request.method !== "HEAD";
  const rule: RateLimitRule = isWrite ? WRITE_RATE_LIMIT : DEFAULT_RATE_LIMIT;

  const bearer = request.headers.get("authorization");
  const identifier = bearer
    ? `key:${bearer.slice(0, 24)}`
    : clientIdentifier(request);

  const result = consume(identifier, rule);
  const headers = headersFor(result, rule);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Slow down and retry later.",
          details: { retryAfterSeconds: result.retryAfterSeconds },
        },
      },
      { status: 429, headers },
    );
  }

  const response = NextResponse.next({ request });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const limited = rateLimitApi(request);
  if (limited) return limited;

  // Refresh the Supabase session so server components see an up-to-date user.
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
