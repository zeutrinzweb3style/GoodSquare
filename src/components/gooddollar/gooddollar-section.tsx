"use client";

import { GoodDollarIdentity } from "@/components/gooddollar/identity-panel";
import { GoodDollarClaim } from "@/components/gooddollar/claim-card";

/**
 * Client wrapper so the Square ID page can stay a server component.
 * Both children self-gate on wallet connection and Celo mainnet.
 */
export function GoodDollarSection() {
  return (
    <div className="space-y-6">
      <div className="gs-rise">
        <GoodDollarIdentity />
      </div>
      <div className="gs-rise" style={{ animationDelay: "90ms" }}>
        <GoodDollarClaim />
      </div>
    </div>
  );
}
