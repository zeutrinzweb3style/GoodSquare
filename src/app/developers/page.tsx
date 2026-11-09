import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listApiKeys } from "@/lib/developer/api-key-service";
import { listWebhookEndpoints } from "@/lib/developer/webhook-service";
import { omit } from "@/lib/developer/serialize";
import { ApiKeyManager } from "@/components/developer/api-key-manager";
import { WebhookManager } from "@/components/developer/webhook-manager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/states";

export const metadata = { title: "Developer Portal" };

const SECTIONS = [
  {
    title: "Versioned REST API",
    body: "Every resource lives under /api/v1. Responses use a { data } envelope and errors use { error: { code, message } }.",
  },
  {
    title: "API authentication",
    body: "Call the API with Authorization: Bearer <api key>, or with the app's own session cookie from the browser.",
  },
  {
    title: "Rate limiting",
    body: "Reads allow 120 requests/minute and writes 30/minute per key or IP. Responses carry X-RateLimit-* headers; 429 includes Retry-After.",
  },
  {
    title: "Webhooks",
    body: "Subscribe HTTPS endpoints to events. Each delivery is signed with HMAC-SHA256 so you can verify it.",
  },
  {
    title: "TypeScript SDK",
    body: "A typed client, webhook verification, and Celo contract helpers ship in @goodsquare/sdk.",
  },
  {
    title: "Smart contracts",
    body: "Non-custodial by design: no contracts are deployed. Payments are ordinary ERC-20 transfers signed by the user's wallet.",
  },
];

export default function DevelopersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading developer portal…" />}>
      <DeveloperPortal />
    </Suspense>
  );
}

async function DeveloperPortal() {
  await connection();
  const session = await getSession();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Developer Portal
        </h1>
        <p className="text-sm text-muted-foreground">
          Build on Good Square. One infrastructure. Unlimited communities.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {session ? (
        <>
          <ApiKeyManager apiKeys={await listApiKeys(session.sub)} />
          <WebhookManager
            endpoints={(await listWebhookEndpoints(session.sub)).map(
              (endpoint) => omit(endpoint, ["secret"]),
            )}
          />
        </>
      ) : (
        <EmptyState
          title="Sign in to manage API keys and webhooks"
          description="Connect your Celo wallet and sign a message to create credentials."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentation</CardTitle>
          <CardDescription>
            Full reference, examples, and the SDK.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            API reference:{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://github.com/zeutrinzweb3style/GoodSquare/blob/main/docs/api.md"
            >
              docs/api.md
            </a>
          </p>
          <p>
            SDK:{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://github.com/zeutrinzweb3style/GoodSquare/tree/main/sdk"
            >
              sdk/
            </a>
          </p>
          <p>
            Examples:{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://github.com/zeutrinzweb3style/GoodSquare/tree/main/sdk/examples"
            >
              sdk/examples/
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
