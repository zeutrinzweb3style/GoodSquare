import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { levelForExp, expToNextLevel } from "@/lib/reputation/levels";
import type { LeaderboardEntry } from "@/lib/types";
import { shortenAddress } from "@/lib/utils";

export function ReputationBadge({ exp }: { exp: number }) {
  return <Badge variant="secondary">{levelForExp(exp).name}</Badge>;
}

export function ExpSummary({
  exp,
  address,
}: {
  exp: number;
  address: string;
}) {
  const toNext = expToNextLevel(exp);
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm text-muted-foreground">
            {shortenAddress(address)}
          </p>
          <ReputationBadge exp={exp} />
        </div>
        <p className="text-2xl font-semibold">{exp} EXP</p>
        <p className="text-xs text-muted-foreground">
          {toNext === null
            ? "Highest level reached."
            : `${toNext} EXP to the next level.`}{" "}
          EXP is a reputation metric, not a currency.
        </p>
      </CardContent>
    </Card>
  );
}

export function Leaderboard({
  entries,
  emptyLabel = "No EXP has been awarded yet.",
}: {
  entries: LeaderboardEntry[];
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <ol className="divide-y divide-border">
          {entries.map((entry, index) => (
            <li
              key={entry.address}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-right font-mono text-muted-foreground">
                  {index + 1}
                </span>
                <span className="truncate font-medium">
                  {entry.display_name ||
                    entry.username ||
                    shortenAddress(entry.address)}
                </span>
                <ReputationBadge exp={entry.exp} />
              </div>
              <span className="shrink-0 font-semibold">{entry.exp} EXP</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
