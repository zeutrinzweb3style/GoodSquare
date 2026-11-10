"use client";

/**
 * Browser glue for the in-app GoodDollar verification popup.
 *
 * Keeps the app on screen: instead of navigating away to GoodID (the SDK's
 * default `popupMode = false`), this opens GoodID in a centered popup and waits
 * for it to redirect back to our callback URL.
 *
 * `openVerificationPopup` must be called synchronously inside the click handler,
 * before any `await`, or the browser treats it as a popup and blocks it.
 */

import {
  waitForVerification,
  type VerifyPopupOutcome,
  type VerifyPopupWindow,
} from "./verification";

const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;

/** Window features string for a centered, chrome-light popup. */
export function verificationPopupFeatures(
  width: number = POPUP_WIDTH,
  height: number = POPUP_HEIGHT,
): string {
  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

/**
 * Opens the verification popup, or returns null when the browser blocks it.
 * Call this synchronously from the click handler and hand the result to
 * `runInAppVerification`.
 */
export function openVerificationPopup(): VerifyPopupWindow | null {
  const width = POPUP_WIDTH;
  const height = POPUP_HEIGHT;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(
    "about:blank",
    "gooddollar-verify",
    `${verificationPopupFeatures(width, height)},left=${left},top=${top}`,
  );
}

/**
 * Fills the already-open popup with the GoodID link and waits for the flow to
 * finish. The caller re-reads the wallet identity afterwards, because GoodID
 * updates the on-chain identity.
 */
export async function runInAppVerification(params: {
  popup: VerifyPopupWindow | null;
  generateLink: (
    popupMode: boolean,
    callbackUrl: string,
    chainId: number,
  ) => Promise<string>;
  chainId: number;
}): Promise<VerifyPopupOutcome> {
  if (!params.popup) return "blocked";
  try {
    const url = await params.generateLink(
      true,
      window.location.href,
      params.chainId,
    );
    params.popup.location.href = url;
  } catch (error) {
    try {
      params.popup.close();
    } catch {
      // The popup may already be gone.
    }
    throw error;
  }
  return waitForVerification(params.popup);
}
