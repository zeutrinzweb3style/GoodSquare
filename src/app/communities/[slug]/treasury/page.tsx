import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import {
  getTreasuryBalances,
  getTreasuryByCommunity,
  listSpendingProposals,
  listTreasuryTransactions,
} from "@/lib/treasury/service";
import { defaultChainId, getToken } from "@/lib/treasury/tokens";
import { formatAmount } from "@/lib/treasury/amounts";
import { BalanceList } from "@/components/treasury/balance-list";
import { TreasuryManager } from "@/components/treasury/treasury-manager";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { shortenAddress } from "@/lib/utils";

export const metadata = { title: "Treasury" };

export default function CommunityTreasuryPage({
  params,
}: PageProps<"/communities/[slug]/treasury">) {
  return (
    <Suspense fallback={<LoadingState label="Loading treasury…" />}>
      <TreasuryDetail params={params} />
    </Suspense>
  );
}

async function TreasuryDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/treasury">["params"];
}) {
  await connection();
  const { slug } = await params;
  const community = await getCommunityBySlugOrId(slug);
  if (!community) notFound();

  const session = await getSession();
  const role = await getRole(community.id, session?.sub);
  if (community.visibility === "private" && !role) {
    notFound();
  }

  const treasury = await getTreasuryByCommunity(community.id);
  const chainId = treasury?.chain_id ?? defaultChainId();
  const balances = treasury ? await getTreasuryBalances(treasury) : [];
  const proposals = await listSpendingProposals(community.id);
  const transactions = treasury
    ? await listTreasuryTransactions(treasury.id, { limit: 50 })
    : [];

  const canManage = can(role, "treasury:manage");
  const canSpend = can(role, "treasury:spend");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/communities/${community.slug}`}
              className="hover:underline"
            >
              {community.name}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Treasury</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Transparent community funds on Celo. Good Square never holds or moves
            money: it reads the treasury wallet and records verified transfers.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/communities/${community.slug}`}>Back to community</Link>
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Balances</h2>
        <div className="mt-4">
          <BalanceList chainId={chainId} balances={balances} />
        </div>
      </section>

      <section className="mt-10">
        <TreasuryManager
          communityId={community.id}
          chainId={chainId}
          treasury={treasury}
          proposals={proposals}
          canManage={canManage}
          canSpend={canSpend}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Verified transfers in and out of the treasury will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {transactions.map((tx) => {
                  const token = getToken(tx.chain_id, tx.token_symbol);
                  const display = token
                    ? formatAmount(BigInt(tx.amount), token.decimals)
                    : tx.amount;
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between py-3 text-sm"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={tx.direction === "in" ? "default" : "outline"}
                          >
                            {tx.direction === "in" ? "In" : "Out"}
                          </Badge>
                          <span className="font-medium">
                            {display} {tx.token_symbol}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {tx.direction === "in"
                            ? `from ${shortenAddress(tx.from_address, 6)}`
                            : `to ${shortenAddress(tx.to_address, 6)}`}
                        </p>
                      </div>
                      <a
                        href={`https://celoscan.io/tx/${tx.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {shortenAddress(tx.tx_hash, 6)}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
