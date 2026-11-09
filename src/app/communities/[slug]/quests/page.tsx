import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import { listQuests } from "@/lib/quest/service";
import { QuestCard } from "@/components/quest/quest-card";
import { CreateQuestForm } from "@/components/quest/create-quest-form";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Quests" };

export default function CommunityQuestsPage({
  params,
}: PageProps<"/communities/[slug]/quests">) {
  return (
    <Suspense fallback={<LoadingState label="Loading quests…" />}>
      <QuestsList params={params} />
    </Suspense>
  );
}

async function QuestsList({
  params,
}: {
  params: PageProps<"/communities/[slug]/quests">["params"];
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

  const quests = await listQuests(community.id);
  const canCreate = can(role, "quest:create");
  const canModerate = can(role, "quest:moderate");

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
          <h1 className="text-2xl font-semibold tracking-tight">Quests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tasks members can complete to earn EXP. A moderator reviews every
            submission before EXP is awarded.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/communities/${community.slug}/leaderboard`}>
              Leaderboard
            </Link>
          </Button>
          {canModerate ? (
            <Button asChild variant="outline">
              <Link href={`/communities/${community.slug}/moderation`}>
                Moderation
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {canCreate ? (
        <div className="mt-6">
          <CreateQuestForm communityId={community.id} />
        </div>
      ) : null}

      <section className="mt-8 space-y-4">
        {quests.length === 0 ? (
          <EmptyState
            title="No quests yet"
            description={
              canCreate
                ? "Create the first quest for this community."
                : "This community has not published any quests yet."
            }
          />
        ) : (
          quests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              communitySlug={community.slug}
            />
          ))
        )}
      </section>
    </main>
  );
}
