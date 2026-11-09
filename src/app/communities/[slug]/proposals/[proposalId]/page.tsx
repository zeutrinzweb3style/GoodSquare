import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getSession } from "@/lib/auth/session";
import {
  computeProposalOutcome,
  getProposalById,
  getVote,
  isEligibleVoter,
  listVotes,
} from "@/lib/governance/service";
import { votingPhase } from "@/lib/governance/results";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VotePanel } from "@/components/governance/vote-panel";
import { LoadingState } from "@/components/ui/states";
import { formatDate, shortenAddress } from "@/lib/utils";

export const metadata = { title: "Proposal" };

const PHASE_LABEL = {
  "not-started": "Voting opens soon",
  open: "Voting open",
  ended: "Voting ended",
} as const;

export default function ProposalDetailPage({
  params,
}: PageProps<"/communities/[slug]/proposals/[proposalId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading proposal…" />}>
      <ProposalDetail params={params} />
    </Suspense>
  );
}

async function ProposalDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/proposals/[proposalId]">["params"];
}) {
  await connection();
  const { slug, proposalId } = await params;

  const community = await getCommunityBySlugOrId(slug);
  if (!community) {
    notFound();
  }

  const proposal = await getProposalById(proposalId);
  if (!proposal || proposal.community_id !== community.id) {
    notFound();
  }

  const session = await getSession();
  const role = await getRole(community.id, session?.sub);
  if (community.visibility === "private" && !role) {
    notFound();
  }

  const { tally, eligible } = await computeProposalOutcome(proposal);
  const phase = votingPhase(proposal);
  const myVote = session ? await getVote(proposal.id, session.sub) : null;
  const canVote = isEligibleVoter(role, proposal.voter_role);
  const votes = await listVotes(proposal.id, { limit: 100 });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/communities/${community.slug}/proposals`}
          className="hover:underline"
        >
          {community.name} proposals
        </Link>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {proposal.title}
        </h1>
        <Badge variant={proposal.status === "active" ? "default" : "muted"}>
          {proposal.status}
        </Badge>
        <Badge variant="outline">{PHASE_LABEL[phase]}</Badge>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {proposal.description || "No description yet."}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Eligibility:{" "}
              {proposal.voter_role === "visitor"
                ? "any connected wallet"
                : `${proposal.voter_role} and above`}
            </span>
            <span>
              Window:{" "}
              {proposal.voting_starts_at
                ? formatDate(proposal.voting_starts_at)
                : "immediately"}{" "}
              →{" "}
              {proposal.voting_ends_at
                ? formatDate(proposal.voting_ends_at)
                : "no deadline"}
            </span>
            <span>
              Proposed by{" "}
              <span className="font-mono">
                {shortenAddress(proposal.created_by)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8">
        <VotePanel
          proposalId={proposal.id}
          results={tally}
          eligible={eligible}
          quorumPercent={proposal.quorum_percent}
          approvalThreshold={proposal.approval_threshold}
          phase={phase}
          myVote={myVote?.choice ?? null}
          canVote={canVote}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          Votes ({votes.length})
        </h2>
        <Card className="mt-4">
          <CardContent className="pt-6">
            {votes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No votes yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {votes.map((vote) => (
                  <li
                    key={vote.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {shortenAddress(vote.address)}
                      </p>
                      {vote.reason ? (
                        <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                          {vote.reason}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        vote.choice === "for"
                          ? "default"
                          : vote.choice === "against"
                            ? "destructive"
                            : "muted"
                      }
                    >
                      {vote.choice}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
