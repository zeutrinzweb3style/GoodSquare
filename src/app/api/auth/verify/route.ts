import { NextResponse, type NextRequest } from "next/server";
import { verifyLoginSchema } from "@/lib/validation/schemas";
import { verifyLogin, AuthError } from "@/lib/auth/service";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { isSessionSecretConfigured } from "@/lib/auth/session-secret";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { badRequest, serverError, unauthorized, validationError } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  // Fail fast, before the wallet is asked to sign, when the server cannot mint
  // a session. Otherwise the nonce is consumed and the user still gets no
  // session — an opaque failure that is hard to diagnose from the client.
  if (!isSessionSecretConfigured()) {
    console.error(
      "auth/verify: SESSION_SECRET is missing or shorter than 32 characters",
    );
    return serverError(
      "Sign-in is unavailable: SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = verifyLoginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  let address: string;
  try {
    address = await verifyLogin(parsed.data);
  } catch (err) {
    if (err instanceof AuthError) {
      return unauthorized(err.message);
    }
    console.error("verify error", err);
    return serverError("Could not verify login");
  }

  // Ensure a profile row exists so membership/foreign keys can reference it.
  // A full profile can be completed later in Square ID.
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("address")
    .eq("address", address)
    .maybeSingle();

  if (!existing) {
    const fallbackUsername = `user_${address.slice(2, 10)}`;
    const { error: insertError } = await supabase.from("profiles").insert({
      address,
      username: fallbackUsername,
    });
    // A unique-username race is fine; the user can rename later.
    if (insertError && insertError.code !== "23505") {
      console.error("profile bootstrap error", insertError);
      return serverError("Could not create profile");
    }
  }

  const token = await createSessionToken(address);
  const response = NextResponse.json({ data: { address } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
