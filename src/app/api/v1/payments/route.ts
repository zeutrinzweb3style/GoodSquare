import { apiError } from "@/lib/api/response";

/**
 * Payments endpoint placeholder (Square Pay, Phase 4).
 *
 * Non-custodial payments are not implemented in the Foundation release.
 * Returning 501 keeps the API contract honest for integrators.
 */
export async function GET() {
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "Square Pay is not available yet. Payments ship in Phase 4.",
  );
}

export async function POST() {
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "Square Pay is not available yet. Payments ship in Phase 4.",
  );
}
