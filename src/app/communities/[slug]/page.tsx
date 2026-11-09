import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinLeaveButton } from "@/components/community/join-leave-button";
import { LoadingState } from "@/components/ui/states";
import { shortenAddress } from "@/lib/utils";
import type { CommunityRole } from "@/lib/permissions";

export default function CommunityPage({
  params,
}: PageProps<"/communities/[slug]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading community…" />}>
      <CommunityDetail params={params} />
    </Suspense>
  );
}

async function CommunityDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]">["params"];
}) {
  await connection();
  const { slug } = await params;
  const community = await getCommunityBySlugOrId(slug);

  if (!community) {
    notFound();
  }

  const session = await getSession();
  const role = (await getRole(
    community.id,
    session?.sub,
  )) as CommunityRole | null;

  if (community.visibility === "private" && !role) {
    notFound();
  }

  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("community_members")
    .select("address, role, joined_at, profiles:address (username, display_name)")
    .eq("community_id", community.id)
    .order("joined_at", { ascending: true })
    .limit(50);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {community.name}
            </h1>
            <Badge variant="muted">{community.visibility}</Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            /{community.slug}
          </p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {community.description || "No description yet."}
          </p>
        </div>
        <JoinLeaveButton
          communityId={community.id}
          communitySlug={community.slug}
          visibility={community.visibility}
          role={role}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/communities/${community.slug}/quests`}>Quests</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/communities/${community.slug}/leaderboard`}>
            Leaderboard
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/communities/${community.slug}/proposals`}>
            Proposals
          </Link>
        </Button>
        {role === "owner" || role === "admin" || role === "moderator" ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/communities/${community.slug}/moderation`}>
              Moderation
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Members" value={community.member_count} />
        <Stat
          label="Created"
          value={new Date(community.created_at).toLocaleDateString()}
        />
        <Stat label="Your role" value={role ? role : "Not a member"} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Members</h2>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              {community.member_count}{" "}
              {community.member_count === 1 ? "member" : "members"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!members || members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {members.map((member) => {
                  const profile = Array.isArray(member.profiles)
                    ? member.profiles[0]
                    : member.profiles;
                  return (
                    <li
                      key={member.address}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <span className="font-medium">
                        {profile?.display_name ||
                          profile?.username ||
                          shortenAddress(member.address)}
                      </span>
                      <Badge variant="outline">{member.role}</Badge>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold capitalize">{value}</p>
      </CardContent>
    </Card>
  );
}
