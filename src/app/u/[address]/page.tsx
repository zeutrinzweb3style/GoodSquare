import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isValidAddress, normalizeAddress } from "@/lib/auth/wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/states";

export default function PublicProfilePage({
  params,
}: PageProps<"/u/[address]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading profile…" />}>
      <ProfileDetail params={params} />
    </Suspense>
  );
}

async function ProfileDetail({
  params,
}: {
  params: PageProps<"/u/[address]">["params"];
}) {
  await connection();
  const { address } = await params;
  if (!isValidAddress(address)) {
    notFound();
  }

  const supabase = createServiceRoleClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("address, username, display_name, bio, avatar_url, created_at")
    .eq("address", normalizeAddress(address))
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const { count: communityCount } = await supabase
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("address", profile.address);

  const { data: reputationRows } = await supabase
    .from("community_reputation")
    .select("exp")
    .eq("address", profile.address);
  const totalExp = (reputationRows ?? []).reduce((sum, row) => sum + row.exp, 0);

  // Only badges from public communities are shown on a public profile.
  const { data: badgeRows } = await supabase
    .from("user_badges")
    .select("id, community_id, badges:badge_id (slug, name, icon)")
    .eq("address", profile.address)
    .order("awarded_at", { ascending: false })
    .limit(24);

  const badgeCommunityIds = [
    ...new Set((badgeRows ?? []).map((row) => row.community_id)),
  ];
  const publicCommunityIds = new Set<string>();
  if (badgeCommunityIds.length > 0) {
    const { data: publicCommunities } = await supabase
      .from("communities")
      .select("id")
      .eq("visibility", "public")
      .in("id", badgeCommunityIds);
    for (const row of publicCommunities ?? []) {
      publicCommunityIds.add(row.id);
    }
  }

  const badges = (badgeRows ?? [])
    .filter((row) => publicCommunityIds.has(row.community_id))
    .map((row) => {
      const badge = Array.isArray(row.badges) ? row.badges[0] : row.badges;
      return badge;
    })
    .filter((badge): badge is { slug: string; name: string; icon: string | null } =>
      Boolean(badge),
    );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
              {(profile.display_name || profile.username)
                .charAt(0)
                .toUpperCase()}
            </span>
            <div>
              <CardTitle>{profile.display_name || profile.username}</CardTitle>
              <p className="text-sm text-muted-foreground">
                @{profile.username}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {profile.bio || "No bio yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              {profile.address.slice(0, 6)}…{profile.address.slice(-4)}
            </Badge>
            <Badge variant="muted">
              {communityCount ?? 0}{" "}
              {communityCount === 1 ? "community" : "communities"}
            </Badge>
            <Badge variant="secondary">{totalExp} EXP</Badge>
          </div>

          {badges.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Badges
              </p>
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <Badge key={badge.slug} variant="outline">
                    {badge.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
