import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import { getLeaderboard } from "@/lib/reputation/service";
import { Leaderboard } from "@/components/reputation/leaderboard";
import { LoadingState } from "@/components/ui/states";

export const metadata = { title: "Leaderboard" };

export default function CommunityLeaderboardPage({
  params,
}: PageProps<"/communities/[slug]/leaderboard">) {
  return (
    <Suspense fallback={<LoadingState label="Loading leaderboard…" />}>
      <LeaderboardView params={params} />
    </Suspense>
  );
}

async function LeaderboardView({
  params,
}: {
  params: PageProps<"/communities/[slug]/leaderboard">["params"];
}) {
  await connection();
  const { slug } = await params;
  const community = await getCommunityBySlugOrId(slug);
  if (!community) {
    notFound();
  }

  const session = await getSession();
  const role = await getRole(community.id, session?.sub);
  if (community.visibility === "private" && !role) {
    notFound();
  }

  const [allTime, weekly, monthly] = await Promise.all([
    getLeaderboard(community.id, { period: "all", limit: 25 }),
    getLeaderboard(community.id, { period: "week", limit: 10 }),
    getLeaderboard(community.id, { period: "month", limit: 10 }),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/communities/${community.slug}`}
          className="hover:underline"
        >
          {community.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reputation is community-specific. EXP reflects participation; it is not
        a currency and guarantees no rewards.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">This week</h2>
        <div className="mt-3">
          <Leaderboard
            entries={weekly}
            emptyLabel="No EXP earned in the last 7 days."
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">This month</h2>
        <div className="mt-3">
          <Leaderboard
            entries={monthly}
            emptyLabel="No EXP earned in the last 30 days."
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">All time</h2>
        <div className="mt-3">
          <Leaderboard entries={allTime} />
        </div>
      </section>
    </main>
  );
}
