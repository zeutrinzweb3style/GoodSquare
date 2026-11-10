import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import { getQuestById, getSubmission, listSubmissions } from "@/lib/quest/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuestSubmitPanel } from "@/components/quest/quest-submit-panel";
import { ModerationQueue } from "@/components/quest/moderation-queue";
import { LoadingState } from "@/components/ui/states";
import { shortenAddress, formatDate, isPast } from "@/lib/utils";

export const metadata = { title: "Quest" };

export default function QuestDetailPage({
  params,
}: PageProps<"/communities/[slug]/quests/[questId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading quest…" />}>
      <QuestDetail params={params} />
    </Suspense>
  );
}

async function QuestDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/quests/[questId]">["params"];
}) {
  await connection();
  const { slug, questId } = await params;

  const community = await getCommunityBySlugOrId(slug);
  if (!community) {
    notFound();
  }

  const quest = await getQuestById(questId);
  if (!quest || quest.community_id !== community.id) {
    notFound();
  }

  const session = await getSession();
  const role = await getRole(community.id, session?.sub);
  if (community.visibility === "private" && !role) {
    notFound();
  }

  const canModerate = role === "owner" || role === "admin" || role === "moderator";
  const existing = session ? await getSubmission(quest.id, session.sub) : null;

  const submissions = canModerate
    ? await listSubmissions(quest.id, { status: "pending" })
    : [];

  const supabase = createServiceRoleClient();
  const { count: approvedCount } = await supabase
    .from("quest_submissions")
    .select("*", { count: "exact", head: true })
    .eq("quest_id", quest.id)
    .eq("status", "approved");

  const deadlinePassed = isPast(quest.deadline);

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

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{quest.title}</h1>
        <Badge variant={quest.status === "active" ? "default" : "muted"}>
          {quest.status}
        </Badge>
        <Badge variant="outline">{quest.category}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="EXP reward"
          value={quest.exp_reward > 0 ? `+${quest.exp_reward}` : "None"}
        />
        <Stat label="Approved" value={approvedCount ?? 0} />
        <Stat
          label="Deadline"
          value={
            quest.deadline
              ? `${deadlinePassed ? "Ended " : ""}${new Date(
                  quest.deadline,
                ).toLocaleDateString()}`
              : "Open"
          }
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {quest.description || "No description yet."}
          </p>
          {quest.requirements ? (
            <div>
              <p className="font-medium">Requirements</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {quest.requirements}
              </p>
            </div>
          ) : null}
          {quest.reward_info ? (
            <div>
              <p className="font-medium">Reward information</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {quest.reward_info}
              </p>
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Approving a submission awards EXP — a reputation metric with no
            monetary value. Token or stablecoin rewards are not automatic: the
            community issues them from its treasury under Community Rewards.
          </div>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(quest.created_at)} by{" "}
            <span className="font-mono">{shortenAddress(quest.created_by)}</span>
          </p>
        </CardContent>
      </Card>

      <div className="mt-8">
        <QuestSubmitPanel
          questId={quest.id}
          isMember={Boolean(role)}
          questStatus={quest.status}
          existing={
            existing
              ? {
                  id: existing.id,
                  status: existing.status,
                  proof_url: existing.proof_url,
                  proof_text: existing.proof_text,
                  review_note: existing.review_note,
                }
              : null
          }
        />
      </div>

      {canModerate ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Pending submissions
          </h2>
          <div className="mt-4">
            <ModerationQueue
              submissions={submissions.map((s) => ({
                id: s.id,
                address: s.address,
                proof_url: s.proof_url,
                proof_text: s.proof_text,
                created_at: s.created_at,
                status: s.status,
                profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
              }))}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
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
