import test from "node:test";
import assert from "node:assert/strict";
import {
  API_KEY_PREFIX,
  apiKeyMatches,
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
  keyPrefix,
  parseAuthorizationHeader,
} from "../src/lib/developer/api-keys.ts";
import {
  DEFAULT_RATE_LIMIT,
  WRITE_RATE_LIMIT,
  checkRateLimit,
  pruneWindow,
  rateLimitHeaders,
  rateLimitResetSeconds,
} from "../src/lib/developer/rate-limit.ts";
import {
  MAX_DELIVERY_ATTEMPTS,
  WEBHOOK_EVENTS,
  buildPayload,
  generateWebhookSecret,
  isDeliveryExhausted,
  isRetryableStatus,
  isWebhookEvent,
  nextRetryDelaySeconds,
  normalizeEvents,
  parseSignatureHeader,
  signPayload,
  verifySignature,
} from "../src/lib/developer/webhooks.ts";
import { verifyWebhookSignature } from "../sdk/src/verify.ts";

test("generated API keys parse back to their prefix", () => {
  const generated = generateApiKey("live");
  assert.ok(generated.key.startsWith(`${API_KEY_PREFIX}_live_`));
  assert.equal(keyPrefix(generated.key), generated.prefix);
  assert.equal(isApiKeyFormat(generated.key), true);
  assert.equal(generated.hash, hashApiKey(generated.key));
});

test("test-environment keys are recognised and live keys are not mistaken for them", () => {
  const live = generateApiKey("live");
  const sandbox = generateApiKey("test");
  assert.equal(keyPrefix(live.key), live.prefix);
  assert.ok(sandbox.prefix.includes("_test_"));
  assert.notEqual(live.prefix, sandbox.prefix);
});

test("malformed keys are rejected", () => {
  assert.equal(keyPrefix(""), null);
  assert.equal(keyPrefix("gs_live_deadbeef"), null); // missing secret
  assert.equal(keyPrefix("gs_staging_a1b2c3d4_" + "0".repeat(48)), null);
  assert.equal(keyPrefix("gs_live_ZZZZZZZZ_" + "0".repeat(48)), null);
  assert.equal(keyPrefix("gs_live_a1b2c3d4_" + "0".repeat(47)), null);
  assert.equal(isApiKeyFormat("nope"), false);
});

test("apiKeyMatches accepts the right key and rejects others", () => {
  const generated = generateApiKey("live");
  assert.equal(apiKeyMatches(generated.key, generated.hash), true);
  assert.equal(apiKeyMatches(generated.key + "0", generated.hash), false);
  assert.equal(apiKeyMatches("", generated.hash), false);
});

test("authorization header parsing extracts a bearer key", () => {
  assert.equal(parseAuthorizationHeader("Bearer abc"), "abc");
  assert.equal(parseAuthorizationHeader("bearer   abc  "), "abc");
  assert.equal(parseAuthorizationHeader("Basic abc"), null);
  assert.equal(parseAuthorizationHeader("Bearer   "), null);
  assert.equal(parseAuthorizationHeader(null), null);
});

test("sliding window prunes old timestamps and keeps order", () => {
  const now = 1_000_000;
  const kept = pruneWindow([now - 90_000, now - 5_000, now - 30_000], now, 60);
  assert.deepEqual(kept, [now - 30_000, now - 5_000]);
});

test("rate limit allows requests until the window fills, then blocks", () => {
  const rule = { limit: 3, windowSeconds: 60 };
  const now = 2_000_000;
  const timestamps = [now - 1_000, now - 2_000];

  const allowed = checkRateLimit({ timestamps, now, rule });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.remaining, 0);
  assert.equal(allowed.count, 3);

  const blocked = checkRateLimit({
    timestamps: [...timestamps, now - 500],
    now,
    rule,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("expired requests free up the window", () => {
  const rule = { limit: 1, windowSeconds: 60 };
  const now = 3_000_000;
  const result = checkRateLimit({
    timestamps: [now - 61_000],
    now,
    rule,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 0);
});

test("default limits are ordered and reset header is bounded", () => {
  assert.ok(DEFAULT_RATE_LIMIT.limit > WRITE_RATE_LIMIT.limit);
  const reset = rateLimitResetSeconds(1_000, WRITE_RATE_LIMIT);
  assert.ok(reset > 0 && reset <= WRITE_RATE_LIMIT.windowSeconds);
});

test("rate limit headers advertise the limit and add Retry-After when blocked", () => {
  const now = 4_000_000;
  const rule = { limit: 5, windowSeconds: 60 };
  const open = rateLimitHeaders(
    { allowed: true, remaining: 4, retryAfterSeconds: 0, count: 1 },
    rule,
    now,
  );
  assert.equal(open["X-RateLimit-Limit"], "5");
  assert.equal(open["X-RateLimit-Remaining"], "4");
  assert.equal(open["Retry-After"], undefined);

  const blocked = rateLimitHeaders(
    { allowed: false, remaining: 0, retryAfterSeconds: 12, count: 5 },
    rule,
    now,
  );
  assert.equal(blocked["Retry-After"], "12");
});

test("webhook event catalogue is closed and de-duplicated", () => {
  assert.equal(isWebhookEvent("payment.received"), true);
  assert.equal(isWebhookEvent("payment.refunded"), false);
  assert.deepEqual(
    normalizeEvents(["vote.cast", "vote.cast", "bogus"]),
    ["vote.cast"],
  );
  assert.equal(WEBHOOK_EVENTS.length, new Set(WEBHOOK_EVENTS).size);
});

test("payload builder fills defaults", () => {
  const payload = buildPayload({
    id: "d1",
    event: "vote.cast",
    createdAt: "2026-11-09T00:00:00.000Z",
  });
  assert.equal(payload.communityId, null);
  assert.deepEqual(payload.data, {});
});

test("webhook secrets are unique and prefixed", () => {
  const a = generateWebhookSecret();
  const b = generateWebhookSecret();
  assert.ok(a.startsWith("whsec_"));
  assert.notEqual(a, b);
});

test("signature round-trips and rejects tampering, staleness, and bad headers", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ event: "payment.received" });
  const now = 5_000_000;
  const header = signPayload(secret, now, body);

  assert.equal(verifySignature({ secret, header, rawBody: body, now }), true);
  assert.equal(
    verifySignature({ secret, header, rawBody: body + " ", now }),
    false,
  );
  assert.equal(
    verifySignature({ secret: generateWebhookSecret(), header, rawBody: body, now }),
    false,
  );
  // Too old: outside the default 300s tolerance.
  assert.equal(
    verifySignature({ secret, header, rawBody: body, now: now + 10_000 }),
    false,
  );
  // Tolerance disabled accepts a stale-but-valid signature.
  assert.equal(
    verifySignature({
      secret,
      header,
      rawBody: body,
      now: now + 10_000,
      toleranceSeconds: 0,
    }),
    true,
  );
  assert.equal(
    verifySignature({ secret, header: "garbage", rawBody: body, now }),
    false,
  );
});

test("signature header parser validates shape", () => {
  assert.equal(parseSignatureHeader("t=1,v1=" + "a".repeat(64))?.timestamp, 1);
  assert.equal(parseSignatureHeader("v1=" + "a".repeat(64)), null);
  assert.equal(parseSignatureHeader("t=1,v1=short"), null);
});

test("retry schedule exhausts after the configured attempts", () => {
  assert.equal(nextRetryDelaySeconds(0), 30);
  assert.equal(nextRetryDelaySeconds(1), 120);
  assert.equal(nextRetryDelaySeconds(MAX_DELIVERY_ATTEMPTS), null);
  assert.equal(isDeliveryExhausted(MAX_DELIVERY_ATTEMPTS - 1), false);
  assert.equal(isDeliveryExhausted(MAX_DELIVERY_ATTEMPTS), true);
});

test("only transient statuses are retryable", () => {
  assert.equal(isRetryableStatus(null), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(200), false);
});

test("the SDK verifier accepts signatures produced by the server", async () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ event: "reward.paid", data: { amount: "1" } });
  const now = 6_000_000;
  const header = signPayload(secret, now, body);

  assert.equal(
    await verifyWebhookSignature({ secret, header, rawBody: body, now }),
    true,
  );
  assert.equal(
    await verifyWebhookSignature({ secret, header, rawBody: body + "!", now }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({
      secret,
      header,
      rawBody: body,
      now: now + 10_000,
    }),
    false,
  );
});
