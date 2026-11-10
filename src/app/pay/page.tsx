import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listPaymentRequests } from "@/lib/pay/service";
import { defaultChainId } from "@/lib/treasury/tokens";
import {
  CreatePaymentRequestForm,
  PaymentRequestList,
} from "@/components/pay/create-payment-request-form";
import { LoadingState } from "@/components/ui/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Square Pay" };

export default function PayPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading payments…" />}>
      <PayHome />
    </Suspense>
  );
}

async function PayHome() {
  await connection();
  const session = await getSession();
  const chainId = defaultChainId();

  const requests = session
    ? [
        ...(await listPaymentRequests({ createdBy: session.sub })),
        ...(await listPaymentRequests({ payee: session.sub })),
      ].filter(
        (request, index, all) =>
          all.findIndex((other) => other.id === request.id) === index,
      )
    : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="gs-rise">
        <h1 className="text-2xl font-semibold tracking-tight">Square Pay</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Request and send payments on Celo, wallet to wallet. Non-custodial by
          design: Good Square records and verifies transfers on-chain but never
          holds your funds.
        </p>
      </div>

      <section className="mt-8 gs-rise" style={{ animationDelay: "60ms" }}>
        <CreatePaymentRequestForm chainId={chainId} />
      </section>

      <section className="mt-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your requests</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentRequestList requests={requests} chainId={chainId} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
