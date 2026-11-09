import { NextResponse, type NextRequest } from "next/server";
import { requestNonceSchema } from "@/lib/validation/schemas";
import { issueNonce, AuthError } from "@/lib/auth/service";
import { badRequest, serverError, validationError } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = requestNonceSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const domain = request.headers.get("host") ?? "goodsquare.local";

  try {
    const record = await issueNonce(parsed.data.address, domain);
    return NextResponse.json({
      data: {
        address: record.address,
        nonce: record.nonce,
        message: record.message,
        issuedAt: record.issuedAt,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return badRequest(err.message);
    }
    console.error("nonce error", err);
    return serverError("Could not create a login nonce");
  }
}
