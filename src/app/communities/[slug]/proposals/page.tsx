import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCommunityBySlugOrId, getRole, can } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import { listProposals } from "@/lib/governance/service";
import { ProposalCard } from "@/components/governance/proposal-card";
import { CreateProposalForm } from "@/components/governance/create-proposal-form";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Proposals" };

export default function CommunityProposalsPage({
  params,
}: PageProps<"/communities/[slug]/proposals">) {
  return (
    <Suspense fallback={<LoadingState label="Loading proposals…" />}>
      <ProposalsList params={params} />
    </Suspense>
  );
}

async function ProposalsList({
  params,
}: {
  params: PageProps<"/communities/[slug]/proposals">["params"];
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

  const proposals = await listProposals(community.id);
  const canCreate = can(role, "proposal:create");

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
          <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Transparent community decisions. The MVP is one wallet, one vote;
            reputation- and token-weighted voting is planned for later.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/communities/${community.slug}`}>Back to community</Link>
        </Button>
      </div>

      {canCreate ? (
        <div className="mt-6">
          <CreateProposalForm communityId={community.id} />
        </div>
      ) : null}

      <section className="mt-8 space-y-4">
        {proposals.length === 0 ? (
          <EmptyState
            title="No proposals yet"
            description={
              canCreate
                ? "Create the first proposal for this community."
                : "This community has not published any proposals yet."
            }
          />
        ) : (
          proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              communitySlug={community.slug}
            />
          ))
        )}
      </section>
    </main>
  );
}
