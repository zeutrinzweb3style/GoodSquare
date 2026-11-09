import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { listPaymentRequests } from "@/lib/pay/service";
import { getTreasuryByCommunity } from "@/lib/treasury/service";
import { defaultChainId } from "@/lib/treasury/tokens";
import {
  CreatePaymentRequestForm,
  PaymentRequestList,
} from "@/components/pay/create-payment-request-form";
import { LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Pay" };

export default function CommunityPayPage({
  params,
}: PageProps<"/communities/[slug]/pay">) {
  return (
    <Suspense fallback={<LoadingState label="Loading payments…" />}>
      <PayDetail params={params} />
    </Suspense>
  );
}

async function PayDetail({
  params,
}: {
  params: PageProps<"/communities/[slug]/pay">["params"];
}) {
  await connection();
  const { slug } = await params;
  const community = await getCommunityBySlugOrId(slug);
  if (!community) notFound();

  const session = await getSession();
  const role = await getRole(community.id, session?.sub);
  if (community.visibility === "private" && !role) {
    notFound();
  }

  const treasury = await getTreasuryByCommunity(community.id);
  const chainId = treasury?.chain_id ?? defaultChainId();
  const requests = await listPaymentRequests({ communityId: community.id });
  const canCreate = can(role, "payment:create");

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
          <h1 className="text-2xl font-semibold tracking-tight">Square Pay</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Non-custodial payments on Celo. Funds move straight from payer to
            payee; Good Square only records and verifies the transfer.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/communities/${community.slug}`}>Back to community</Link>
        </Button>
      </div>

      <section className="mt-8">
        {canCreate ? (
          <CreatePaymentRequestForm
            communityId={community.id}
            chainId={chainId}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Request a payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Contributors and above can create payment requests for this
                community.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          Payment requests
        </h2>
        <Card className="mt-4">
          <CardContent className="pt-6">
            <PaymentRequestList requests={requests} chainId={chainId} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
