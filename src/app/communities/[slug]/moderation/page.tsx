import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import { listCommunitySubmissions } from "@/lib/quest/service";
import { ModerationQueue } from "@/components/quest/moderation-queue";
import { LoadingState } from "@/components/ui/states";

export const metadata = { title: "Moderation" };

export default function CommunityModerationPage({
  params,
}: PageProps<"/communities/[slug]/moderation">) {
  return (
    <Suspense fallback={<LoadingState label="Loading moderation queue…" />}>
      <ModerationView params={params} />
    </Suspense>
  );
}

async function ModerationView({
  params,
}: {
  params: PageProps<"/communities/[slug]/moderation">["params"];
}) {
  await connection();
  const { slug } = await params;
  const community = await getCommunityBySlugOrId(slug);
  if (!community) {
    notFound();
  }

  const session = await getSession();
  if (!session) {
    redirect("/communities");
  }

  const role = await getRole(community.id, session.sub);
  if (!can(role, "quest:moderate")) {
    notFound();
  }

  const submissions = await listCommunitySubmissions(community.id, {
    status: "pending",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/communities/${community.slug}/quests`}
          className="hover:underline"
        >
          {community.name} quests
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Moderation queue
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Approving a submission awards the quest&apos;s EXP reward once. Rewards
        are never transferred automatically.
      </p>

      <div className="mt-8">
        <ModerationQueue
          submissions={submissions.map((s) => ({
            id: s.id,
            address: s.address,
            proof_url: s.proof_url,
            proof_text: s.proof_text,
            created_at: s.created_at,
            status: s.status,
            profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
            quests: Array.isArray(s.quests) ? s.quests[0] : s.quests,
          }))}
        />
      </div>
    </main>
  );
}
