import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Community } from "@/lib/types";

export function CommunityCard({ community }: { community: Community }) {
  return (
    <Card className="gs-hover-lift gs-surface group overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>
            <Link
              href={`/communities/${community.slug}`}
              className="transition-colors group-hover:text-primary"
            >
              {community.name}
            </Link>
          </CardTitle>
          <Badge variant="muted">{community.visibility}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {community.description || "No description yet."}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          {community.member_count}{" "}
          {community.member_count === 1 ? "member" : "members"} ·{" "}
          <span className="font-mono">/{community.slug}</span>
        </p>
      </CardContent>
    </Card>
  );
}
