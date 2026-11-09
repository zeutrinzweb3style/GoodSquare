"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/pay/qr-code";

/**
 * Share panel for a payment request: a copyable link and a QR code. The QR is
 * generated in the browser, so the payment URL never leaves the page.
 */
export function PaymentShare({
  path,
  title,
  amount,
  tokenSymbol,
}: {
  path: string;
  title: string;
  amount: string;
  tokenSymbol: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium">Share this request</p>
        <p className="text-xs text-muted-foreground">
          Anyone with the link or QR code can pay {amount} {tokenSymbol}.
        </p>
        <div className="flex items-center gap-2">
          <code className="max-w-[16rem] truncate rounded bg-background px-2 py-1 font-mono text-xs">
            {path}
          </code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
      <QrCode value={url} size={140} label={title} />
    </div>
  );
}
