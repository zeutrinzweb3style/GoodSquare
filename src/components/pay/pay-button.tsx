"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { useSendToken } from "@/lib/treasury/use-send-token";
import { formatAmount } from "@/lib/treasury/amounts";
import { getToken } from "@/lib/treasury/tokens";

/**
 * Sends a token transfer from the connected wallet and hands the hash back to
 * the caller for verification. Signing happens in the user's wallet.
 */
export function PayButton({
  chainId,
  tokenSymbol,
  to,
  /** Amount in base units. */
  amount,
  label,
  onSent,
  disabled,
  variant = "default",
}: {
  chainId: number;
  tokenSymbol: string;
  to: string;
  amount: string;
  label?: string;
  onSent: (hash: `0x${string}`) => void | Promise<void>;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary";
}) {
  const { isConnected } = useAccount();
  const sendToken = useSendToken();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = getToken(chainId, tokenSymbol);
  const display = token ? formatAmount(BigInt(amount), token.decimals) : amount;

  async function handleClick() {
    setError(null);
    setSending(true);
    try {
      const hash = await sendToken({ chainId, tokenSymbol, to, amount });
      await onSent(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send payment");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        onClick={handleClick}
        disabled={disabled || sending || !isConnected}
      >
        {sending
          ? "Confirm in wallet…"
          : (label ?? `Pay ${display} ${tokenSymbol}`)}
      </Button>
      {!isConnected ? (
        <p className="text-xs text-muted-foreground">
          Connect your wallet to pay.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
