"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/communities", label: "Explore" },
  { href: "/communities/new", label: "Create" },
  { href: "/pay", label: "Pay" },
  { href: "/notifications", label: "Notifications" },
  { href: "/developers", label: "Developers" },
  { href: "/profile", label: "Square ID" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 py-2">
        <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-2" onClick={closeMobileMenu}>
          <span className="gs-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground shadow-md shadow-primary/30 transition-transform group-hover:scale-105">
            GS
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Good Square
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground xl:px-3"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ConnectWalletButton />
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-border bg-background px-4 py-3 lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-6xl gap-1 sm:grid-cols-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
