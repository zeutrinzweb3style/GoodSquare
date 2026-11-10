import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getGdollarActivity } from "@/lib/gooddollar/activity";
import { G_DOLLAR_DECIMALS } from "@/lib/gooddollar/config";
import { formatAmount } from "@/lib/treasury/amounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/states";

export const metadata = { title: "G$ activity" };

export default function CommunityActivityPage({
  params,
}: PageProps<"/communities/[slug]/activity">) {
  return (
    <Suspense fallback={<LoadingState label="Loading G$ activity…" />}>
      <ActivityDetail params={params} />
    </Suspense>
  );
}

async function ActivityDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/activity">["params"];
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

  const activity = await getGdollarActivity(community.id);
  const g = (value: bigint) => formatAmount(value, G_DOLLAR_DECIMALS);

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
          <h1 className="text-2xl font-semibold tracking-tight">G$ activity</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Verified on-chain G$ activity in this community: how many wallets
            use it, how many transactions settled, and how much G$ moved. These
            are the numbers GoodBuilders tracks across teams.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/communities/${community.slug}/pay`}>Pay in G$</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label="G$ volume" value={`${g(activity.volume)} G$`} />
        <Metric label="Transactions" value={activity.transactions} />
        <Metric label="Unique wallets" value={activity.uniqueWallets} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">{activity.payments.count}</span>{" "}
              verified payment{activity.payments.count === 1 ? "" : "s"}
            </p>
            <p className="text-muted-foreground">
              {g(activity.payments.volume)} G$ moved through Square Pay
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contributor rewards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">
                {activity.rewards.paidCount}
              </span>{" "}
              paid reward{activity.rewards.paidCount === 1 ? "" : "s"}
            </p>
            <p className="text-muted-foreground">
              {g(activity.rewards.paidVolume)} G$ paid to contributors
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Treasury flow</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                G$ in
              </p>
              <p className="mt-1 text-lg font-semibold">
                {g(activity.treasury.inVolume)} G$
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                G$ out
              </p>
              <p className="mt-1 text-lg font-semibold">
                {g(activity.treasury.outVolume)} G$
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Every number is derived from rows verified on-chain (Celo mainnet).
        Good Square never estimates or custodies funds.
      </p>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
