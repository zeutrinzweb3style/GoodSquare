import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/treasury/amounts";
import { getToken } from "@/lib/treasury/tokens";
import type { TokenBalance } from "@/lib/types";

export function BalanceList({
  chainId,
  balances,
}: {
  chainId: number;
  balances: TokenBalance[];
}) {
  if (balances.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Set a treasury address to see live balances.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {balances.map((entry) => {
        const token = getToken(chainId, entry.token_symbol);
        const value =
          entry.balance == null
            ? "—"
            : formatAmount(BigInt(entry.balance), entry.decimals);
        return (
          <Card key={entry.token_symbol}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {entry.token_symbol}
                </p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
              {token?.note ? (
                <Badge variant="muted">{token.note}</Badge>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
