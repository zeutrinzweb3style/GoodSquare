# Good Square API reference

Versioned REST API for third-party integrations. Base path: `/api/v1`.

- **Envelope** — success responses wrap the payload in `{ "data": ... }`;
  errors use `{ "error": { "code", "message", "details"? } }`.
- **Authentication** — session cookie (the app) or
  `Authorization: Bearer <api key>` (integrations).
- **Rate limiting** — reads 120 requests/minute, writes 30 requests/minute per
  key or IP. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
  `X-RateLimit-Reset`; a `429` also carries `Retry-After`.
- **Amounts** — always integers in base units, sent as strings (for example
  `"1500000"` for 1.5 USDC at 6 decimals). The server never does floating-point
  arithmetic on money.

## Error codes

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Missing or invalid credentials |
| 403 | `FORBIDDEN` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Resource does not exist or is not visible |
| 409 | `CONFLICT` | Conflicts with current state |
| 422 | `VALIDATION_ERROR` | Payload failed schema validation |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

## Authentication

### API keys

Create a key in the Developer Portal (`/developers`) or with
`POST /api/v1/api-keys`. The full key is returned once; the server stores only
its SHA-256 hash and a short prefix.

```
Authorization: Bearer gs_live_<prefix>_<secret>
```

Revoke a key with `DELETE /api/v1/api-keys/:id`. Revocation is immediate.

### Session

The browser app authenticates with a signed `gs_session` cookie obtained from
the wallet login flow (`/api/auth/nonce` then `/api/auth/verify`). Endpoints
that act on behalf of a wallet accept either credential.

## Communities

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/communities` | public | List public communities (`limit`, `offset`) |
| POST | `/api/v1/communities` | required | Create a community (creator becomes owner) |
| GET | `/api/v1/communities/:id` | optional | Community detail (`:id` is a UUID or slug) |
| GET | `/api/v1/communities/:id/members` | optional | List members |
| POST | `/api/v1/communities/:id/join` | required | Join a public community |
| DELETE | `/api/v1/communities/:id/join` | required | Leave a community |
| GET | `/api/v1/communities/:id/leaderboard` | optional | Contribution leaderboard |
| GET | `/api/v1/communities/:id/quests` | optional | List quests |
| GET | `/api/v1/communities/:id/proposals` | optional | List proposals |
| GET | `/api/v1/communities/:id/treasury` | optional | Treasury overview |

## Quests

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/quests/:id` | optional | Quest detail |
| GET | `/api/v1/quests/:id/submissions` | required | List submissions (moderators) |
| POST | `/api/v1/quests/:id/submissions` | required | Submit proof for a quest |

## Reputation

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/reputation/:wallet` | optional | Reputation summary, history, badges |

Pass `?community=<id|slug>` to scope to one community.

## Governance

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/proposals/:id` | optional | Proposal detail |
| GET | `/api/v1/proposals/:id/results` | optional | Tally |
| POST | `/api/v1/proposals/:id/vote` | required | Cast a vote |

## Treasury

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/communities/:id/treasury` | optional | Treasury, balances, proposals |
| POST | `/api/v1/communities/:id/treasury` | required | Create or update the treasury |
| GET | `/api/v1/communities/:id/treasury/signers` | optional | List signers |
| POST | `/api/v1/communities/:id/treasury/spending` | required | Create a spending proposal |
| POST | `/api/v1/treasury/spending/:id` | required | Approve or reject a proposal |
| POST | `/api/v1/treasury/spending/:id/execute` | required | Submit the executed transfer hash |

Approving a proposal never moves funds. A signer must send the transfer from
their own wallet and submit the hash, which the server verifies against the
approved terms before marking the proposal executed.

## Payments

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/payments` | required | List payments |
| POST | `/api/v1/payments` | required | Record a verified payment |
| GET | `/api/v1/payment-requests` | required | List payment requests |
| POST | `/api/v1/payment-requests` | required | Create a payment request |
| GET | `/api/v1/payment-requests/:id` | optional | Payment request detail |

## Profiles

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/profiles/:address` | public | Public profile |
| PATCH | `/api/v1/profiles/me` | required | Update your own profile |

## GoodDollar

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/gooddollar/identity?address=…&chainId=…` | public | GoodDollar citizen status for a wallet |

`GET /api/v1/gooddollar/identity` reads the on-chain GoodDollar identity
registry. It is read-only and needs no session.

- `address` (required): the wallet to look up.
- `chainId` (optional): the caller's chain. Anything other than Celo mainnet
  (`42220`) returns `{ supported: false, reason }`, because GoodDollar has no
  testnet deployment.

Response when supported:

```json
{
  "data": {
    "supported": true,
    "chainId": 42220,
    "address": "0x…",
    "isWhitelisted": true,
    "root": "0x…",
    "lastAuthenticated": 1730000000,
    "authenticationPeriod": 15552000
  }
}
```

Face verification, wallet linking, and the daily G$ claim happen in the browser
through `@goodsdks/citizen-sdk`; the claim is a mainnet transaction signed by the
user's own wallet. Good Square never holds a key. See the GoodDollar section in
[`README.md`](../README.md) for the flow.

## Notifications

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | required | List your notifications |
| PATCH | `/api/v1/notifications` | required | Mark notifications read |

## Developer

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/api-keys` | required | List your API keys |
| POST | `/api/v1/api-keys` | required | Create an API key |
| DELETE | `/api/v1/api-keys/:id` | required | Revoke an API key |
| GET | `/api/v1/webhooks` | required | List webhook endpoints |
| POST | `/api/v1/webhooks` | required | Create a webhook endpoint |
| PATCH | `/api/v1/webhooks/:id` | required | Update an endpoint |
| DELETE | `/api/v1/webhooks/:id` | required | Delete an endpoint |
| GET | `/api/v1/webhooks/:id/deliveries` | required | Recent deliveries |
| POST | `/api/v1/webhooks/dispatch` | cron secret | Run the retry queue |

## Webhooks

### Events

`community.created`, `member.joined`, `quest.submitted`, `quest.approved`,
`proposal.created`, `proposal.closed`, `vote.cast`, `payment.received`,
`treasury.spending.approved`, `treasury.spending.executed`, `reward.paid`.

### Delivery

Each delivery is a `POST` with a JSON body:

```json
{
  "id": "0b6f...",
  "event": "payment.received",
  "createdAt": "2026-11-09T12:00:00.000Z",
  "communityId": "c1a2...",
  "data": { "paymentId": "...", "amount": "1500000", "tokenSymbol": "USDC" }
}
```

Headers:

| Header | Meaning |
| --- | --- |
| `X-GoodSquare-Event` | Event name |
| `X-GoodSquare-Delivery` | Delivery id, stable across retries |
| `X-GoodSquare-Signature` | `t=<unix>,v1=<hex hmac>` |

### Verifying signatures

The signature is HMAC-SHA256 over `<t>.<raw body>` using the endpoint secret.
Verify against the raw body bytes, before parsing JSON, and reject stale
timestamps (default tolerance: 300 seconds).

```ts
import { verifyWebhookSignature } from "@goodsquare/sdk";

const ok = await verifyWebhookSignature({
  secret: process.env.GOODSQUARE_WEBHOOK_SECRET!,
  header: request.headers.get("x-goodsquare-signature"),
  rawBody: raw,
});
```

### Retries

A delivery that fails with a retryable status (`408`, `425`, `429`, or `5xx`) is
retried with backoff: 30s, 2m, 10m, 1h, 6h, up to five attempts. Respond `2xx`
quickly and process asynchronously. The retry queue runs when the deployment's
scheduled job calls `POST /api/v1/webhooks/dispatch` with the `CRON_SECRET`.

## Smart contracts

Good Square deploys no contracts and holds no keys. Every on-chain action is an
ordinary ERC-20 `transfer` (or a native CELO send) signed by the user's wallet.
Token addresses live in the server registry (`src/lib/treasury/tokens.ts`) and
in the SDK (`@goodsquare/sdk` `TOKENS`). The SDK exposes the standard ERC-20 ABI
for use with `viem`.
