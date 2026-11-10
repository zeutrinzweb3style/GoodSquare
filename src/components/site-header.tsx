import Link from "next/link";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

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
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            GS
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Good Square
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <ConnectWalletButton />
      </div>
    </header>
  );
}
