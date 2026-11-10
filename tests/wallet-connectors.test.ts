import test from "node:test";
import assert from "node:assert/strict";
import {
  describeConnectError,
  hasInjectedProvider,
  visibleWalletConnectors,
  walletConnectMetadata,
  walletOptionFor,
} from "../src/lib/wallet/connectors.ts";

test("known connectors get a friendly label", () => {
  assert.equal(walletOptionFor("injected").name, "Browser wallet");
  assert.equal(walletOptionFor("walletConnect").name, "WalletConnect");
  assert.equal(walletOptionFor("app.phantom").name, "Phantom");
  assert.equal(walletOptionFor("io.metamask").name, "MetaMask");
  assert.equal(walletOptionFor("custom", "Rainbow").name, "Rainbow");
});

test("an unknown connector falls back to its id", () => {
  const option = walletOptionFor("someFutureWallet");
  assert.equal(option.id, "someFutureWallet");
  assert.equal(option.name, "someFutureWallet");
  assert.equal(option.description, "Connect with someFutureWallet");
});

test("named injected wallets replace the generic injected option", () => {
  const connectors = visibleWalletConnectors([
    { id: "injected" },
    { id: "walletConnect" },
    { id: "app.phantom" },
    { id: "io.metamask" },
  ]);
  assert.deepEqual(
    connectors.map((connector) => connector.id),
    ["io.metamask", "app.phantom", "walletConnect"],
  );
});

test("generic injected remains available when no named provider is discovered", () => {
  const connectors = visibleWalletConnectors([
    { id: "injected" },
    { id: "walletConnect" },
  ]);
  assert.deepEqual(
    connectors.map((connector) => connector.id),
    ["injected", "walletConnect"],
  );
});

test("a missing provider is explained with an actionable message", () => {
  const err = Object.assign(new Error("Provider not found"), {
    name: "ProviderNotFoundError",
  });
  assert.match(describeConnectError(err), /Install MetaMask, or connect with WalletConnect/);
});

test("a rejection is reported as a cancellation, not a failure", () => {
  const err = Object.assign(new Error("User rejected the request"), {
    name: "UserRejectedRequestError",
  });
  assert.match(describeConnectError(err), /cancelled the request/i);
});

test("a rejection detected only by message is still handled", () => {
  assert.match(
    describeConnectError(new Error("user denied transaction")),
    /cancelled the request/i,
  );
});

test("an unknown error gets a safe generic message", () => {
  assert.match(describeConnectError({}), /try again/i);
  assert.match(describeConnectError(null), /try again/i);
});

test("injected provider detection is safe without a window", () => {
  assert.equal(hasInjectedProvider(), false);
});

test("walletConnect metadata is shaped for the protocol", () => {
  const meta = walletConnectMetadata("https://example.test");
  assert.equal(meta.name, "Good Square");
  assert.equal(meta.url, "https://example.test");
  assert.deepEqual(meta.icons, ["https://example.test/favicon.ico"]);
});
