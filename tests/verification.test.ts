import test from "node:test";
import assert from "node:assert/strict";
import {
  hasReturnedFromVerification,
  isGoodDollarOrigin,
  waitForVerification,
  type VerifyPopupWindow,
} from "../src/lib/gooddollar/verification.ts";

/** A fake popup whose URL and closed flag the test can drive. */
function fakePopup(url: string): VerifyPopupWindow {
  return {
    closed: false,
    location: { href: url },
    close() {
      this.closed = true;
    },
  };
}

/** Timers the test drives by hand so no real waiting happens. */
function fakeTimers() {
  let intervalFn: (() => void) | null = null;
  let timeoutFn: (() => void) | null = null;
  return {
    setIntervalFn: ((fn: () => void) => {
      intervalFn = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval,
    clearIntervalFn: (() => {
      intervalFn = null;
    }) as unknown as typeof clearInterval,
    setTimeoutFn: ((fn: () => void) => {
      timeoutFn = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout,
    clearTimeoutFn: (() => {
      timeoutFn = null;
    }) as unknown as typeof clearTimeout,
    tick() {
      intervalFn?.();
    },
    fireTimeout() {
      timeoutFn?.();
    },
  };
}

test("isGoodDollarOrigin matches GoodID and GoodDollar hosts only", () => {
  assert.equal(isGoodDollarOrigin("https://goodid.gooddollar.org/?lz=abc"), true);
  assert.equal(isGoodDollarOrigin("https://gooddollar.org"), true);
  assert.equal(isGoodDollarOrigin("https://wallet.gooddollar.org"), true);
  assert.equal(isGoodDollarOrigin("https://good-square.vercel.app"), false);
  assert.equal(isGoodDollarOrigin("not a url"), false);
});

test("hasReturnedFromVerification ignores GoodDollar and non-web URLs", () => {
  assert.equal(hasReturnedFromVerification(undefined), false);
  assert.equal(hasReturnedFromVerification("about:blank"), false);
  assert.equal(
    hasReturnedFromVerification("https://goodid.gooddollar.org/verify"),
    false,
  );
  assert.equal(
    hasReturnedFromVerification("https://good-square.vercel.app/square-id"),
    true,
  );
});

test("waitForVerification resolves 'returned' and closes the popup", async () => {
  const popup = fakePopup("https://goodid.gooddollar.org/verify");
  const timers = fakeTimers();
  const promise = waitForVerification(popup, timers);

  timers.tick();
  assert.equal(popup.closed, false, "still open while on GoodID");

  popup.location.href = "https://good-square.vercel.app/square-id";
  timers.tick();

  assert.equal(await promise, "returned");
  assert.equal(popup.closed, true);
});

test("waitForVerification ignores about:blank while the popup loads", async () => {
  const popup = fakePopup("about:blank");
  const timers = fakeTimers();
  const promise = waitForVerification(popup, timers);

  timers.tick();
  assert.equal(popup.closed, false);

  popup.location.href = "https://goodid.gooddollar.org/verify";
  timers.tick();
  assert.equal(popup.closed, false, "still waiting on GoodID");

  popup.closed = true;
  timers.tick();
  assert.equal(await promise, "closed");
});

test("waitForVerification resolves 'closed' when the user dismisses it", async () => {
  const popup = fakePopup("https://goodid.gooddollar.org/verify");
  const timers = fakeTimers();
  const promise = waitForVerification(popup, timers);

  popup.closed = true;
  timers.tick();

  assert.equal(await promise, "closed");
});

test("waitForVerification resolves 'blocked' for a null popup", async () => {
  assert.equal(await waitForVerification(null), "blocked");
});

test("waitForVerification resolves 'timeout' and closes the popup", async () => {
  const popup = fakePopup("https://goodid.gooddollar.org/verify");
  const timers = fakeTimers();
  const promise = waitForVerification(popup, timers);

  timers.fireTimeout();

  assert.equal(await promise, "timeout");
  assert.equal(popup.closed, true);
});
