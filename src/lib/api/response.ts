import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function unauthorized(message = "Authentication required") {
  return apiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have permission to do that") {
  return apiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found") {
  return apiError(404, "NOT_FOUND", message);
}

export function badRequest(message: string, details?: unknown) {
  return apiError(400, "BAD_REQUEST", message, details);
}

export function conflict(message: string) {
  return apiError(409, "CONFLICT", message);
}

export function validationError(error: ZodError) {
  return apiError(422, "VALIDATION_ERROR", "Invalid request payload", {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function serverError(message = "Something went wrong") {
  return apiError(500, "INTERNAL_ERROR", message);
}
