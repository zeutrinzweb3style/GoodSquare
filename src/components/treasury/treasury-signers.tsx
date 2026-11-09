"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { shortenAddress } from "@/lib/utils";
import type { TreasurySigner } from "@/lib/types";

/**
 * Manage the treasury's signer list and approval threshold. Naming signers
 * turns spending approvals into a threshold vote: a proposal becomes approved
 * only after `threshold` distinct signers approve it. Signers never gain
 * custody of funds.
 */
export function TreasurySigners({
  communityId,
  signers,
  approvalThreshold,
  canManage,
}: {
  communityId: string;
  signers: TreasurySigner[];
  approvalThreshold: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [threshold, setThreshold] = useState(String(approvalThreshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = signers.length > 0 ? Math.min(approvalThreshold, signers.length) : 1;

  async function addSigner(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/communities/${communityId}/treasury/signers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not add");
      setAddress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the signer");
    } finally {
      setBusy(false);
    }
  }

  async function removeSigner(signer: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/communities/${communityId}/treasury/signers/${signer}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not remove");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/treasury`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalThreshold: Number(threshold) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not save");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>Signers &amp; approvals</CardTitle>
          <Badge variant={signers.length > 0 ? "default" : "muted"}>
            {signers.length > 0 ? `${effective} of ${signers.length}` : "single approver"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          With signers, a spending proposal needs a threshold of distinct
          approvals before it can be executed. Approving never moves funds.
        </p>

        {signers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No signers yet. Add wallets to require multiple approvals.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {signers.map((signer) => (
              <li
                key={signer.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-mono">
                  {shortenAddress(signer.address, 6)}
                </span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => removeSigner(signer.address)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <div className="space-y-4">
            <form onSubmit={addSigner} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1 space-y-2">
                <Label htmlFor="signer-address">Signer wallet</Label>
                <Input
                  id="signer-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x…"
                  required
                />
              </div>
              <Button type="submit" disabled={busy}>
                Add signer
              </Button>
            </form>

            <form
              onSubmit={saveThreshold}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="w-32 space-y-2">
                <Label htmlFor="signer-threshold">Threshold</Label>
                <Input
                  id="signer-threshold"
                  type="number"
                  min={1}
                  max={20}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy}>
                Save threshold
              </Button>
            </form>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
