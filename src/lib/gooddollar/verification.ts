/**
 * Pure helpers for the in-app GoodDollar face-verification popup.
 *
 * The GoodDollar SDK's `generateFVLink(popupMode, callbackUrl, chainId)` builds
 * a link to GoodID. With `popupMode = false` the caller navigates the whole page
 * away; with `popupMode = true` the link carries a `cbu` (callback URL) instead
 * of an `rdu` (redirect URL) so the flow can run in a popup and the app stays
 * open. Everything here is framework-free so it can be unit tested.
 */

/** The subset of `window` the popup runner needs, so it can be faked in tests. */
export interface VerifyPopupWindow {
  closed: boolean;
  close: () => void;
  location: { href: string };
}

/** GoodID and the GoodDollar web surfaces all live under this domain. */
const GOODDOLLAR_DOMAIN = "gooddollar.org";

/** Detects a return to GoodID's verification page versus our own callback. */
export function isGoodDollarOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === GOODDOLLAR_DOMAIN ||
      hostname.endsWith(`.${GOODDOLLAR_DOMAIN}`)
    );
  } catch {
    return false;
  }
}

/**
 * Whether the popup has left GoodID and come back to our origin. GoodID
 * redirects the popup to `callbackUrl` when verification finishes, so the first
 * web URL that is not GoodDollar is our signal to stop waiting and re-check the
 * status. Non-web URLs (`about:blank` while the popup is being filled in) do not
 * count as a return.
 */
export function hasReturnedFromVerification(
  currentUrl: string | undefined,
): boolean {
  if (!currentUrl) return false;
  let protocol: string;
  try {
    protocol = new URL(currentUrl).protocol;
  } catch {
    return false;
  }
  if (protocol !== "http:" && protocol !== "https:") return false;
  return !isGoodDollarOrigin(currentUrl);
}

export interface WaitForVerificationOptions {
  /** How often to look for a return, in milliseconds. */
  intervalMs?: number;
  /** Give up after this long, in milliseconds. */
  timeoutMs?: number;
  /** Injectable timers for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export type VerifyPopupOutcome = "returned" | "closed" | "blocked" | "timeout";

/**
 * Watches an already-open verification popup and resolves when it comes back to
 * our callback, when the user closes it, when the browser blocked it (a null
 * handle), or when it times out. It never navigates the current page, so the
 * claim flow stays mounted.
 */
export function waitForVerification(
  popup: VerifyPopupWindow | null,
  options: WaitForVerificationOptions = {},
): Promise<VerifyPopupOutcome> {
  if (!popup) return Promise.resolve("blocked");

  const {
    intervalMs = 400,
    timeoutMs = 5 * 60 * 1000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = options;

  return new Promise<VerifyPopupOutcome>((resolve) => {
    const finish = (outcome: VerifyPopupOutcome) => {
      clearIntervalFn(poll);
      clearTimeoutFn(timeout);
      resolve(outcome);
    };

    const poll = setIntervalFn(() => {
      // The browser keeps the handle while open, but reading a cross-origin URL
      // throws. Treat an unreadable URL as "still on GoodID".
      let href: string | undefined;
      try {
        href = popup.location.href;
      } catch {
        href = undefined;
      }
      if (hasReturnedFromVerification(href)) {
        try {
          popup.close();
        } catch {
          // Already closed or cross-origin; nothing to do.
        }
        finish("returned");
        return;
      }
      if (popup.closed) finish("closed");
    }, intervalMs);

    const timeout = setTimeoutFn(() => {
      try {
        popup.close();
      } catch {
        // Ignore: the popup may already be gone.
      }
      finish("timeout");
    }, timeoutMs);
  });
}
