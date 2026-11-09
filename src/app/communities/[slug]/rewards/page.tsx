import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getTreasuryByCommunity } from "@/lib/treasury/service";
import { listRewardDistributions } from "@/lib/rewards/service";
import { RewardsManager } from "@/components/rewards/rewards-manager";
import { LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Rewards" };

export default function CommunityRewardsPage({
  params,
}: PageProps<"/communities/[slug]/rewards">) {
  return (
    <Suspense fallback={<LoadingState label="Loading rewards…" />}>
      <RewardsDetail params={params} />
    </Suspense>
  );
}

async function RewardsDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/rewards">["params"];
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
  const distributions = await listRewardDistributions(community.id);
  const canDistribute = can(role, "reward:distribute");

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
          <h1 className="text-2xl font-semibold tracking-tight">
            Community rewards
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pay contributors from the community treasury in supported tokens.
            Each payout is sent from the treasury wallet and verified on-chain
            before it is recorded.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/communities/${community.slug}/treasury`}>
            View treasury
          </Link>
        </Button>
      </div>

      <section className="mt-8">
        <RewardsManager
          communityId={community.id}
          treasury={treasury}
          distributions={distributions}
          canDistribute={canDistribute}
        />
      </section>
    </main>
  );
}
