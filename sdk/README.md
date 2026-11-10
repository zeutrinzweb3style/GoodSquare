# @goodsquare/sdk

Official TypeScript SDK for the [Good Square](https://github.com/zeutrinzweb3style/GoodSquare) API.

- Typed client for the versioned REST API (`/api/v1`)
- Automatic retries with backoff on `429` and `5xx`
- Webhook signature verification using the Web Crypto API
- Celo token registry and ERC-20 ABI for on-chain integrations
- Zero runtime dependencies; works on Node 18+, Deno, Bun, and edge runtimes

## Install

```bash
npm install @goodsquare/sdk
```

## Quick start

Create an API key from the Developer Portal, then:

```ts
import { GoodSquare } from "@goodsquare/sdk";

const gs = new GoodSquare({ apiKey: process.env.GOODSQUARE_API_KEY });

const { communities, total } = await gs.communities.list({ limit: 10 });
console.log(`${total} communities`);

const detail = await gs.communities.get(communities[0].slug);
```

Public endpoints (community lists, profiles) work without a key:

```ts
const gs = new GoodSquare();
const profile = await gs.profiles.get("0xabc...");
```

## Authentication

Every request may carry an API key as a bearer token. Create keys in the
Developer Portal (`/developers`). Keys are shown once; the server stores only a
hash. Use `gs_test_...` keys against a testnet deployment and `gs_live_...` in
production.

```ts
const gs = new GoodSquare({ apiKey: "gs_live_..." });
```

## Errors

Non-2xx responses throw a `GoodSquareError` with the HTTP status and a
machine-readable code:

```ts
import { GoodSquare, GoodSquareError } from "@goodsquare/sdk";

try {
  await gs.communities.create({ name: "My DAO", slug: "my-dao" });
} catch (error) {
  if (error instanceof GoodSquareError && error.code === "RATE_LIMITED") {
    // back off and retry
  }
}
```

## Webhooks

Subscribe endpoints from the Developer Portal or the API, then verify each
delivery. Verify against the raw body, before parsing JSON:

```ts
import { verifyWebhookSignature } from "@goodsquare/sdk";

export async function POST(request: Request) {
  const raw = await request.text();
  const ok = await verifyWebhookSignature({
    secret: process.env.GOODSQUARE_WEBHOOK_SECRET!,
    header: request.headers.get("x-goodsquare-signature"),
    rawBody: raw,
  });
  if (!ok) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(raw);
  if (event.event === "payment.received") {
    // handle the payment
  }
  return new Response(null, { status: 204 });
}
```

## Smart contracts

Good Square is non-custodial and deploys no contracts. Payments are ordinary
ERC-20 transfers from the user's wallet. The SDK exposes the token registry and
the ERC-20 ABI so you can build on-chain flows with `viem`:

```ts
import { ERC20_ABI, getToken, CELO_MAINNET_CHAIN_ID } from "@goodsquare/sdk";

const token = getToken(CELO_MAINNET_CHAIN_ID, "USDC");
// token.contract, token.decimals
```

## Reference

Full documentation lives in [`docs/api.md`](../docs/api.md) in the main
repository. Examples are in [`examples/`](./examples).
