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
  "app.phantom": {
    id: "app.phantom",
    name: "Phantom",
    description: "Connect with the Phantom browser wallet",
  },
  "io.metamask": {
    id: "io.metamask",
    name: "MetaMask",
    description: "Connect with the MetaMask browser wallet",
  },
};

/** Human-readable label for a connector id, preferring provider metadata. */
export function walletOptionFor(id: string, providerName?: string): WalletOption {
  const known = KNOWN_OPTIONS[id];
  if (known) return known;
  const name = providerName?.trim() || id;
  return { id, name, description: `Connect with ${name}` };
}

/**
 * Removes Wagmi's generic injected connector when named EIP-6963 wallets are
 * available, then puts browser wallets before WalletConnect.
 */
export function visibleWalletConnectors<T extends { id: string }>(
  connectors: readonly T[],
): T[] {
  const hasNamedBrowserWallet = connectors.some(
    (connector) => connector.id !== "injected" && connector.id !== "walletConnect",
  );
  const filtered = hasNamedBrowserWallet
    ? connectors.filter((connector) => connector.id !== "injected")
    : [...connectors];
  const priority = (id: string) => {
    if (id === "io.metamask") return 0;
    if (id === "app.phantom") return 1;
    if (id === "injected") return 2;
    if (id === "walletConnect") return 3;
    return 4;
  };
  return [...filtered].sort((left, right) => priority(left.id) - priority(right.id));
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
