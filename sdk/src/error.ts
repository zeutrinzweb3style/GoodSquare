/**
 * Error thrown for any non-2xx API response. Carries the HTTP status and the
 * machine-readable error code so callers can branch without parsing strings.
 */
export class GoodSquareError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status: number; code: string; details?: unknown },
  ) {
    super(message);
    this.name = "GoodSquareError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}
