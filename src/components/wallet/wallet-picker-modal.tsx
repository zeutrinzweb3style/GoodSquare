"use client";

import { useState } from "react";
import { useConnect } from "wagmi";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  describeConnectError,
  hasInjectedProvider,
  walletOptionFor,
} from "@/lib/wallet/connectors";

/**
 * Wallet picker. Lists every configured connector so a phone user can reach
 * WalletConnect instead of a browser-extension connector that cannot work
 * there, and surfaces connect failures instead of failing silently.
 */
export function WalletPickerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { connectors, connectAsync, isPending } = useConnect();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleConnect(connectorId: string) {
    const connector = connectors.find((c) => c.id === connectorId);
    if (!connector) return;
    setError(null);
    setPendingId(connectorId);
    try {
      await connectAsync({ connector });
      onClose();
    } catch (err) {
      setError(describeConnectError(err));
    } finally {
      setPendingId(null);
    }
  }

  const injectedAvailable = hasInjectedProvider();

  return (
    <Dialog open={open} onClose={onClose} labelledBy="wallet-picker-title">
      <div className="p-6">
        <h2
          id="wallet-picker-title"
          className="text-lg font-semibold tracking-tight"
        >
          Connect a wallet
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how to connect. WalletConnect works on phones and in any
          browser.
        </p>

        <div className="mt-5 space-y-2">
          {connectors.map((connector) => {
            const option = walletOptionFor(connector.id);
            const isInjected = connector.id === "injected";
            const disabled =
              isPending || (isInjected && !injectedAvailable);
            return (
              <Button
                key={connector.id}
                variant="outline"
                className="h-auto w-full justify-start px-4 py-3 text-left"
                disabled={disabled}
                onClick={() => handleConnect(connector.id)}
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">
                    {option.name}
                    {isInjected && !injectedAvailable ? " — not detected" : ""}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {pendingId === connector.id ? (
                  <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                ) : null}
              </Button>
            );
          })}
        </div>

        {!injectedAvailable ? (
          <p className="mt-4 text-xs text-muted-foreground">
            No browser wallet was detected. Use WalletConnect to scan a QR code
            with a mobile wallet.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
