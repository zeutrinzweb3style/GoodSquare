import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CommunityCard } from "@/components/community/community-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { serializeCommunity } from "@/lib/community/service";

export const metadata = { title: "Explore Communities" };

export default function CommunitiesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="gs-rise">
          <h1 className="text-2xl font-semibold tracking-tight">
            Explore Communities
          </h1>
          <p className="text-sm text-muted-foreground">
            On-chain communities building on Good Square. Join with a wallet —
            no sign-up.
          </p>
        </div>
        <Button
          asChild
          className="gs-brand-gradient text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Link href="/communities/new">Create a community</Link>
        </Button>
      </div>

      <div className="mt-8">
        <Suspense fallback={<LoadingState label="Loading communities…" />}>
          <CommunityList />
        </Suspense>
      </div>
    </main>
  );
}

async function CommunityList() {
  await connection();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(48);

  if (error) {
    return (
      <ErrorState description="We could not load communities right now." />
    );
  }

  const communities = (data ?? []).map((row) => serializeCommunity(row, null));

  if (communities.length === 0) {
    return (
      <EmptyState
        title="No communities yet"
        description="Be the first to create one. Connect your wallet and set up a community in a minute."
        action={
          <Button asChild>
            <Link href="/communities/new">Create a community</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((community) => (
        <CommunityCard key={community.id} community={community} />
      ))}
    </div>
  );
}
