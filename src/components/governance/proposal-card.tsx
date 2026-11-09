import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPast } from "@/lib/utils";
import { votingPhase } from "@/lib/governance/results";
import type { Proposal } from "@/lib/types";

const STATUS_VARIANT: Record<
  Proposal["status"],
  "default" | "muted" | "outline" | "destructive"
> = {
  active: "default",
  draft: "muted",
  closed: "outline",
  cancelled: "destructive",
};

const PHASE_LABEL = {
  "not-started": "Voting opens soon",
  open: "Voting open",
  ended: "Voting ended",
} as const;

export function ProposalCard({
  proposal,
  communitySlug,
}: {
  proposal: Proposal;
  communitySlug: string;
}) {
  const phase = votingPhase(proposal);
  const endsSoon = isPast(proposal.voting_ends_at);

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>
            <Link
              href={`/communities/${communitySlug}/proposals/${proposal.id}`}
              className="hover:underline"
            >
              {proposal.title}
            </Link>
          </CardTitle>
          <Badge variant={STATUS_VARIANT[proposal.status]}>
            {proposal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {proposal.description || "No description yet."}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {proposal.voter_role === "visitor"
              ? "Any wallet may vote"
              : `${proposal.voter_role}+ may vote`}
          </Badge>
          <span>Quorum {proposal.quorum_percent}%</span>
          <span>·</span>
          <span>Approval {proposal.approval_threshold}%</span>
          {proposal.status === "active" ? (
            <>
              <span>·</span>
              <span>{PHASE_LABEL[phase]}</span>
            </>
          ) : null}
          {proposal.voting_ends_at ? (
            <>
              <span>·</span>
              <span>
                {endsSoon ? "Ended" : "Ends"}{" "}
                {new Date(proposal.voting_ends_at).toLocaleDateString()}
              </span>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
