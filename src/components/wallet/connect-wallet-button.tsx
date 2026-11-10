"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WalletPickerModal } from "@/components/wallet/wallet-picker-modal";
import { useAuth } from "@/lib/auth/use-auth";
import { shortenAddress } from "@/lib/utils";

/**
 * Header wallet control. Three states: disconnected (opens the picker),
 * connected but unauthenticated (offers sign-in), and signed in (profile menu).
 *
 * Connecting a wallet only proves the wallet is present; the signature is what
 * proves ownership. So after a successful connect we attempt the sign-in
 * automatically once, and let the person retry if they dismissed the prompt.
 */
export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { profile, isAuthenticated, isLoading, isSigningIn, signIn, signOut, error } =
    useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Track which address we already auto-prompted, so a wallet that rejects the
  // signature is not asked again on every render.
  const promptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return; // Wait for the existing session to load first.
    if (!isConnected || isAuthenticated || !address) return;
    if (promptedFor.current === address) return;
    promptedFor.current = address;
    signIn().catch(() => {
      // The error surfaces through `error` from useAuth.
    });
  }, [isLoading, isConnected, isAuthenticated, address, signIn]);

  if (!isConnected) {
    return (
      <>
        <Button onClick={() => setShowPicker(true)}>Connect Wallet</Button>
        <WalletPickerModal
          open={showPicker}
          onClose={() => setShowPicker(false)}
        />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => disconnect()}>
          {shortenAddress(address ?? "")}
        </Button>
        <Button onClick={() => signIn()} disabled={isSigningIn}>
          {isSigningIn ? "Check wallet…" : "Sign in to continue"}
        </Button>
        {error ? (
          <span
            className="hidden max-w-[16rem] text-xs text-destructive sm:inline"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {(profile?.display_name || profile?.username || "?")
            .charAt(0)
            .toUpperCase()}
        </span>
        <span className="hidden sm:inline">
          {profile?.display_name || profile?.username}
        </span>
      </button>

      {showMenu ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <div className="mb-2 space-y-1">
            <Badge variant="muted">{shortenAddress(address ?? "")}</Badge>
          </div>
          <Link
            href="/profile"
            onClick={() => setShowMenu(false)}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            My Square ID
          </Link>
          <Link
            href="/communities/new"
            onClick={() => setShowMenu(false)}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            Create a community
          </Link>
          <button
            onClick={async () => {
              setShowMenu(false);
              await signOut();
            }}
            className="mt-1 block w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
          >
            Sign out
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              disconnect();
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            Disconnect wallet
          </button>
        </div>
      ) : null}
    </div>
  );
}
