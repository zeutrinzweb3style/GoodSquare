/**
 * Wallet connection helpers.
 *
 * Pure and framework-free so the picker labels and connect-error copy can be
 * unit tested without a browser, a wallet extension, or a live relay.
 */

export interface WalletOption {
  id: string;
  name: string;
  description: string;
}

const KNOWN_OPTIONS: Record<string, WalletOption> = {
  injected: {
    id: "injected",
    name: "Browser wallet",
    description: "MetaMask, Rabby, or another browser extension",
  },
  walletConnect: {
    id: "walletConnect",
    name: "WalletConnect",
    description: "Scan a QR code with any mobile wallet",
  },
};

/** Human-readable label for a connector id, falling back to the raw id. */
export function walletOptionFor(id: string): WalletOption {
  return KNOWN_OPTIONS[id] ?? { id, name: id, description: "" };
}

/**
 * WalletConnect app metadata. `icons` is required by the protocol; an inline
 * SVG keeps it working without a hosted asset.
 */
export function walletConnectMetadata(origin: string) {
  return {
    name: "Good Square",
    description: "Open community infrastructure on Celo",
    url: origin,
    icons: [`${origin}/favicon.ico`],
  };
}

/** Whether a browser-extension (injected) provider is present. */
export function hasInjectedProvider(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { ethereum?: unknown }).ethereum)
  );
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/**
 * Turns a connect error into copy a person can act on. `ProviderNotFoundError`
 * is the common one on phones, where no extension exists.
 */
export function describeConnectError(error: unknown): string {
  const name = errorName(error);
  const message = errorMessage(error);

  if (name === "ProviderNotFoundError" || /provider not found/i.test(message)) {
    return "No browser wallet was found. Install MetaMask, or connect with WalletConnect.";
  }
  if (name === "UserRejectedRequestError" || /reject|denied/i.test(message)) {
    return "You cancelled the request in your wallet.";
  }
  if (/already (pending|connected)/i.test(message)) {
    return "A connection request is already open. Check your wallet.";
  }
  return "Could not connect the wallet. Please try again.";
}
