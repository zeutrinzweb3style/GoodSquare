import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidAddress,
  normalizeAddress,
  toChecksumAddress,
} from "../src/lib/auth/wallet.ts";
import {
  buildSiweMessage,
  generateNonce,
} from "../src/lib/auth/nonce.ts";

const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";

test("normalizeAddress lowercases and trims", () => {
  assert.equal(
    normalizeAddress(`  ${ADDRESS}  `),
    ADDRESS.toLowerCase(),
  );
});

test("isValidAddress accepts checksummed and lowercase addresses", () => {
  assert.equal(isValidAddress(ADDRESS), true);
  assert.equal(isValidAddress(ADDRESS.toLowerCase()), true);
});

test("isValidAddress rejects malformed input", () => {
  assert.equal(isValidAddress("0x123"), false);
  assert.equal(isValidAddress("not-an-address"), false);
  assert.equal(isValidAddress(""), false);
});

test("toChecksumAddress returns the EIP-55 form", () => {
  assert.equal(toChecksumAddress(ADDRESS.toLowerCase()), ADDRESS);
});

test("toChecksumAddress falls back to input on invalid addresses", () => {
  assert.equal(toChecksumAddress("nope"), "nope");
});

test("generateNonce is hex and unique", () => {
  const a = generateNonce();
  const b = generateNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("buildSiweMessage binds address, nonce, and timestamp", () => {
  const message = buildSiweMessage({
    domain: "goodsquare.local",
    address: ADDRESS.toLowerCase(),
    nonce: "abc123",
    issuedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.match(message, /goodsquare\.local wants you to sign in/);
  assert.match(message, new RegExp(ADDRESS.toLowerCase()));
  assert.match(message, /Nonce: abc123/);
  assert.match(message, /Issued At: 2026-01-01T00:00:00\.000Z/);
  assert.match(message, /will not trigger a blockchain transaction/);
});
