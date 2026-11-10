import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPast } from "@/lib/utils";
import type { Quest } from "@/lib/types";

const STATUS_VARIANT: Record<Quest["status"], "default" | "muted" | "outline"> = {
  active: "default",
  draft: "muted",
  closed: "outline",
};

export function QuestCard({
  quest,
  communitySlug,
}: {
  quest: Quest;
  communitySlug: string;
}) {
  const deadlinePassed = isPast(quest.deadline);

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>
            <Link
              href={`/communities/${communitySlug}/quests/${quest.id}`}
              className="hover:underline"
            >
              {quest.title}
            </Link>
          </CardTitle>
          <Badge variant={STATUS_VARIANT[quest.status]}>{quest.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {quest.description || "No description yet."}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{quest.category}</Badge>
          {quest.verified_only ? (
            <Badge variant="outline">Verified humans</Badge>
          ) : null}
          <span>
            {quest.exp_reward > 0
              ? `+${quest.exp_reward} EXP`
              : "No EXP reward"}
          </span>
          <span>·</span>
          <span>
            {quest.submission_count}{" "}
            {quest.submission_count === 1 ? "submission" : "submissions"}
          </span>
          {quest.deadline ? (
            <>
              <span>·</span>
              <span>
                {deadlinePassed ? "Ended" : "Ends"}{" "}
                {new Date(quest.deadline).toLocaleDateString()}
              </span>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Approvals award EXP. Token or stablecoin payouts are issued separately
          by the community from its treasury.
        </p>
      </CardContent>
    </Card>
  );
}
