"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/use-auth";
import { shortenAddress } from "@/lib/utils";

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { profile, isAuthenticated, isSigningIn, signIn, signOut, error } =
    useAuth();
  const [showMenu, setShowMenu] = useState(false);

  if (!isConnected) {
    const injectedConnector = connectors.find((c) => c.id === "injected");
    return (
      <Button
        onClick={() =>
          injectedConnector && connect({ connector: injectedConnector })
        }
        disabled={isConnecting || !injectedConnector}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => disconnect()}>
          {shortenAddress(address ?? "")}
        </Button>
        <Button onClick={() => signIn()} disabled={isSigningIn}>
          {isSigningIn ? "Check wallet…" : "Sign in"}
        </Button>
        {error ? (
          <span className="hidden text-xs text-destructive sm:inline">
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
