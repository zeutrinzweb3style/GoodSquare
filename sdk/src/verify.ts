/**
 * Verifies a Good Square webhook signature. Works in any runtime with the
 * Web Crypto API (Node 18+, Deno, Bun, browsers).
 *
 * A delivery carries the header `X-GoodSquare-Signature: t=<unix>,v1=<hex>`.
 * The signature is HMAC-SHA256 over `<t>.<raw body>` using the endpoint's
 * secret. Always verify against the raw body bytes, before JSON parsing.
 *
 * ```ts
 * const ok = await verifyWebhookSignature({
 *   secret: process.env.GOODSQUARE_WEBHOOK_SECRET!,
 *   header: req.headers["x-goodsquare-signature"],
 *   rawBody: raw,
 * });
 * if (!ok) return new Response("invalid signature", { status: 400 });
 * ```
 */
export interface VerifyWebhookInput {
  secret: string;
  header: string | null | undefined;
  rawBody: string;
  /** Unix seconds. Defaults to now. */
  now?: number;
  /** Reject timestamps older than this many seconds. Defaults to 300. */
  toleranceSeconds?: number;
}

function parseHeader(
  header: string,
): { timestamp: number; signature: string } | null {
  const map: Record<string, string> = {};
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) map[key.trim()] = value.trim();
  }
  const timestamp = Number(map.t);
  if (!Number.isFinite(timestamp) || !/^[0-9a-f]{64}$/.test(map.v1 ?? "")) {
    return null;
  }
  return { timestamp, signature: map.v1 };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison of two equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyWebhookSignature(
  input: VerifyWebhookInput,
): Promise<boolean> {
  if (!input.header) return false;
  const parsed = parseHeader(input.header);
  if (!parsed) return false;

  const tolerance = input.toleranceSeconds ?? 300;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - parsed.timestamp) > tolerance) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${input.rawBody}`),
  );
  return safeEqual(toHex(mac), parsed.signature);
}
