import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MODULES = [
  {
    name: "Square ID",
    status: "Phase 1 · Available",
    description:
      "Wallet-based identity. Connect a Celo wallet, verify with a signed message, and build a public profile.",
  },
  {
    name: "Communities",
    status: "Phase 1 · Available",
    description:
      "Create communities, invite members, and manage roles with backend-enforced permissions.",
  },
  {
    name: "Square Quest",
    status: "Phase 2 · Planned",
    description:
      "Create tasks, accept proof of contribution, and let moderators approve or reject submissions.",
  },
  {
    name: "Square Reputation",
    status: "Phase 2 · Planned",
    description:
      "Track EXP, badges, and leaderboards. Reputation is a metric, never a currency.",
  },
  {
    name: "Square Governance",
    status: "Phase 3 · Planned",
    description:
      "Transparent proposals, voting periods, quorum, and approval thresholds.",
  },
  {
    name: "Square Treasury & Pay",
    status: "Phase 4 · Planned",
    description:
      "Non-custodial treasury visibility and stablecoin payments on Celo. Requires security review.",
  },
];

const STEPS = [
  "Connect a Celo-compatible wallet",
  "Sign a message to prove wallet ownership",
  "Create your Square ID profile",
  "Create or join a community",
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16">
      <section className="flex flex-col items-start gap-6">
        <Badge variant="outline">Open-source · Built on Celo</Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          One infrastructure. Unlimited communities.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Good Square is open-source, modular community infrastructure on Celo.
          Instead of every project rebuilding membership, contribution tracking,
          reputation, and payments, Good Square provides interoperable
          components that work together or on their own.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/communities">Explore communities</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/communities/new">Create a community</Link>
          </Button>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="rounded-xl border border-border bg-card p-4 text-sm"
            >
              <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">
          The six core modules
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <Card key={module.name}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{module.name}</CardTitle>
                  <Badge
                    variant={
                      module.status.includes("Available") ? "default" : "muted"
                    }
                  >
                    {module.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {module.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-border bg-accent/40 p-8">
        <h2 className="text-xl font-semibold tracking-tight">
          Non-custodial by design
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Users keep control of their wallets and assets. Good Square never
          requests or stores private keys or seed phrases. Community
          permissions and treasury authority stay separate from platform
          administration.
        </p>
      </section>
    </main>
  );
}
