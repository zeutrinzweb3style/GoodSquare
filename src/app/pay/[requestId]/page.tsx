import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCommunityBySlugOrId, getRole } from "@/lib/community/service";
import { getPaymentRequestById } from "@/lib/pay/service";
import { PayRequestView } from "@/components/pay/pay-request-view";
import { LoadingState } from "@/components/ui/states";

export const metadata = { title: "Pay" };

export default function PayRequestPage({
  params,
}: PageProps<"/pay/[requestId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading payment…" />}>
      <PayRequestDetail params={params} />
    </Suspense>
  );
}

async function PayRequestDetail({
  params,
}: {
  params: PageProps<"/pay/[requestId]">["params"];
}) {
  await connection();
  const { requestId } = await params;
  const request = await getPaymentRequestById(requestId);
  if (!request) notFound();

  if (request.community_id) {
    const community = await getCommunityBySlugOrId(request.community_id);
    const session = await getSession();
    const role = await getRole(request.community_id, session?.sub);
    if (!community || (community.visibility === "private" && !role)) {
      notFound();
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="mb-6 text-center">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Good Square
        </Link>
      </div>
      <PayRequestView request={request} />
    </main>
  );
}
