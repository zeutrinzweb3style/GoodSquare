# Good Square — Open Community Infrastructure

> One infrastructure. Unlimited communities.

Good Square is open-source, modular community infrastructure built on the
[Celo](https://celo.org) blockchain. Instead of every project rebuilding
membership, contribution tracking, reputation, and payments from scratch, Good
Square offers interoperable modules that work together or on their own.

This repository contains **Phase 1 — Foundation** (Square ID, community
creation and membership, auth, API, and data layer), **Phase 2 —
Participation** (Square Quest and Square Reputation), **Phase 3 —
Governance** (proposals and voting), **Phase 4 — Financial
infrastructure** (Square Treasury with multisig-style approvals, Square Pay
with QR codes, community rewards, and notifications), and **Phase 5 —
Developer ecosystem** (API keys, rate limiting, webhooks, a TypeScript SDK,
and public documentation).

## What's implemented

| Module | Status | Notes |
| --- | --- | --- |
| **Square ID** | ✅ Available | Wallet-based identity, profile create/edit, public profile pages |
| **Communities** | ✅ Available | Create, join, leave; owner/admin/moderator/contributor/member roles |
| **Square Quest** | ✅ Available | Quest creation, proof submissions, moderator review |
| **Square Reputation** | ✅ Available | EXP ledger, levels, badges, weekly/monthly leaderboards |
| **Square Governance** | ✅ Available | Proposals, configurable eligibility/quorum/threshold, one-wallet-one-vote |
| **Square Treasury** | ✅ Available | Non-custodial community treasury: verified balances, spending proposals, multisig-style approvals, transparent activity |
| **Square Pay** | ✅ Available | Non-custodial stablecoin payments, shareable payment requests, and QR codes |
| **Community Rewards** | ✅ Available | Non-custodial contributor reward distributions from the treasury |
| **Notifications** | ✅ Available | In-app updates for proposals, payments, and rewards |
| **Versioned API** | ✅ Available | REST endpoints under `/api/v1` |
| **Developer ecosystem** | ✅ Available | API keys, rate limiting, webhooks, TypeScript SDK, and docs |
| **GoodDollar identity & UBI** | ✅ Available (mainnet) | GoodDollar citizen verification and daily G$ claim on Square ID |

Square Treasury and Square Pay are **non-custodial**: the backend never holds a
key and never sends a transaction. Every on-chain movement is signed by a user's
own wallet; the server only verifies the receipt and records it.

### Square Reputation in detail

- EXP is recorded as an **append-only ledger** (`reputation_events`). Totals are
  always derived, never edited in place, so every change is auditable.
- Levels follow the specification: Newcomer (0–99), Contributor (100–499),
  Active Member (500–999), Builder (1,000–2,499), Ambassador (2,500–4,999),
  Champion (5,000+).
- Reputation is **community-specific by default**; the API can also aggregate
  across communities.
- **EXP is a reputation metric, not a currency.** It has no monetary value and
  guarantees no rewards.
- Only authorized community actions award EXP. Approving a quest submission is
  the only automatic source, and it can only happen once per submission.
- Leaderboards support all-time, weekly (last 7 days), and monthly (last 30
  days) windows.

### Square Governance in detail

- Proposals carry a title, description, voting start/end dates, and per-community
  rules: who may vote (a minimum role), a **quorum** percentage of eligible
  members, and an **approval threshold** percentage of decisive votes.
- The MVP is **one wallet, one vote**. Duplicate voting is prevented by a unique
  `(proposal_id, address)` constraint, and a `weight` column (fixed at 1) leaves
  room for future reputation- or token-weighted voting.
- Quorum counts every cast vote; approval is measured over decisive votes only,
  so an abstention never counts for or against a proposal.
- Every vote and status change is written to `audit_logs`. Results are derived
  from a `proposal_results` view, never stored as an editable total.
- Voting is open only while a proposal is `active` and inside its window.

### Square Treasury in detail

- A treasury is a public reference to a community wallet. Good Square has no
  authority over the address and cannot move funds.
- Balances are read live from Celo for the allowlisted tokens (CELO, cUSD,
  USDC, USDT).
- A spending proposal is an off-chain record of intent. **Approving it changes a
  status only.**
- A community can name **signers** and set an **approval threshold**. A proposal
  then becomes `approved` only after that many distinct signers approve it.
  Signers never gain custody.
- A signer sends the transaction from the treasury wallet and submits the hash.
  The server verifies the receipt (token contract, sender, recipient, exact
  amount) before marking the proposal `executed` and recording the transaction.

### Community Rewards in detail

- A reward distribution is a plan to pay several contributors in one token.
- It moves nothing until it is activated. For each recipient, a treasury signer
  sends the transfer and submits the hash; the server verifies it, marks the
  recipient `paid`, and records the treasury transaction.
- When every recipient is paid or skipped, the distribution completes
  automatically. Duplicate recipients and non-positive amounts are rejected.
- **Rewards and quests.** Approving a quest submission always awards EXP. If
  the quest promises a token amount, the approval also queues the contributor as
  a recipient on that quest's reward distribution, which a signer then pays. A
  quest with no token reward awards EXP only and creates no payout.

### Developer ecosystem in detail

- **API keys.** Create keys in the Developer Portal (`/developers`) or with
  `POST /api/v1/api-keys`. A key looks like `gs_live_<prefix>_<secret>`; the
  server stores only a short prefix and a SHA-256 hash, and the full key is
  shown once. Present it as `Authorization: Bearer <key>`. Revocation is
  immediate.
- **Rate limiting.** A sliding window of 120 requests/minute for reads and 30
  for writes, per key or IP. Responses carry `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, and `X-RateLimit-Reset`; a `429` also carries
  `Retry-After`.
- **Webhooks.** Subscribe HTTPS endpoints to events and receive signed POSTs.
  Each delivery is signed with HMAC-SHA256 (`X-GoodSquare-Signature:
  t=<unix>,v1=<hex>`), so a receiver can prove the payload came from Good
  Square. Failed deliveries retry with backoff (30s, 2m, 10m, 1h, 6h; five
  attempts) and the queue is drained by `POST /api/v1/webhooks/dispatch`.
- **TypeScript SDK.** `@goodsquare/sdk` (in [`sdk/`](./sdk)) is a typed client
  with automatic retries, webhook verification, and Celo token/ABI helpers. It
  has zero runtime dependencies and works on Node, Deno, Bun, and edge
  runtimes.
- **Documentation and examples.** [`docs/api.md`](./docs/api.md) is the full API
  reference; runnable examples live in [`sdk/examples`](./sdk/examples).

### GoodDollar identity & UBI in detail

Square ID can verify a wallet as a **GoodDollar citizen** and let it claim its
daily **G$** Universal Basic Income. This is an optional add-on that lives on the
Square ID page (`/profile`).

- **Mainnet only.** GoodDollar has no testnet deployment. Its contracts live on
  Celo mainnet (42220), Fuse (122), and XDC (50); this integration supports Celo
  mainnet only and stays hidden on every other chain, including Celo Sepolia.
  The UI shows a "Switch to Celo" prompt instead of silently failing.
- **Still non-custodial.** The claim is a real mainnet transaction signed by the
  user's own wallet. The backend never holds a key and never sends anything; it
  only reads the public identity registry.
- **Citizen verification.** Unverified wallets hand off to GoodDollar's own face
  verification flow (`generateFVLink`). Verification stays on GoodDollar.
- **Wallet linking.** A verified citizen can link secondary wallets
  (`connectAccount`) so they share one identity and one UBI claim.
- **Two-signature claim flow.** Claiming can require up to two mainnet
  transactions: a faucet top-up for gas, then the claim itself. A modal walks the
  user through both, showing "Step 1 of 2" then "Step 2 of 2" and never hiding
  the second signature. The step logic lives in `src/lib/gooddollar/claim-flow.ts`
  (pure, tested in `tests/claim-flow.test.ts`); the modal is
  `src/components/gooddollar/claim-modal.tsx`.
- **Read-only status endpoint.** `GET /api/v1/gooddollar/identity?address=…`
  returns whether an address is a verified citizen and its root identity.

Powered by the official `@goodsdks/citizen-sdk` and `@goodsdks/react-hooks`
packages. Verified Celo mainnet contract addresses and the environment live in
`src/lib/gooddollar/config.ts`.

## Design principles

- **Non-custodial.** Good Square never asks for or stores private keys or seed
  phrases. Users keep control of their wallets and assets.
- **No native token.** There is no speculative tokenomics in the MVP. EXP is a
  reputation metric with no monetary value.
- **Community-owned.** Communities own their data and rules. Platform
  administration is kept separate from community authority.
- **Auditable.** Every sensitive action is written to an append-only
  `audit_logs` table.
- **Interoperable.** Modules expose a versioned API and can be adopted
  independently.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components) + React 19
- **TypeScript**, **Tailwind CSS v4**
- **wagmi** + **viem** for Celo wallet connectivity and signature verification
- **Supabase** (Postgres + Row Level Security) for persistence
- **jose** for signed session cookies
- **zod** for request validation

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. Bypasses RLS — never expose it |
| `SESSION_SECRET` | Random string ≥ 32 chars used to sign session cookies |
| `NEXT_PUBLIC_CELO_CHAIN_ID` | `42220` (mainnet) or `11142220` (Celo Sepolia) |
| `NEXT_PUBLIC_CELO_RPC_URL` | Celo mainnet RPC |
| `NEXT_PUBLIC_CELO_SEPOLIA_RPC_URL` | Celo Sepolia RPC |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown project id for WalletConnect (mobile + any browser). Optional — without it only browser-extension wallets work |

Generate a session secret with `openssl rand -base64 48`. Get a WalletConnect
project id (free) at <https://cloud.reown.com>.

### 3. Apply the database schema

Run the migrations in your Supabase project (SQL editor or Supabase CLI), in
order:

```bash
supabase/migrations/0001_phase1_foundation.sql
supabase/migrations/0002_phase2_participation.sql
supabase/migrations/0003_phase3_governance.sql
supabase/migrations/0004_phase4_financial.sql
supabase/migrations/0005_phase4_financial_completion.sql
supabase/migrations/0006_phase5_developer.sql
supabase/migrations/0007_phase6_goodbuilders.sql
supabase/migrations/0008_quest_rewards.sql
```

They create `profiles`, `communities`, `community_members`, `auth_nonces`,
`audit_logs`, `quests`, `quest_submissions`, `quest_approvals`,
`reputation_events`, `badges`, `user_badges`, `proposals`, `votes`,
`treasuries`, `treasury_signers`, `treasury_spending_proposals`,
`treasury_spending_approvals`, `treasury_transactions`, `payment_requests`,
`payments`, `reward_distributions`, `reward_recipients`, `notifications`,
`api_keys`, and `webhook_endpoints` / `webhook_deliveries`, and enable Row
Level Security on all of them.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication flow

1. The client requests a single-use nonce from `POST /api/auth/nonce`.
2. The wallet signs the returned human-readable message.
3. The client sends the signature to `POST /api/auth/verify`.
4. The server checks the nonce is unused and unexpired, verifies the signature
   with viem, consumes the nonce, then issues a signed, `httpOnly` session
   cookie.
5. A profile row is bootstrapped on first successful login.

## API reference (v1)

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/nonce` | Issue a login nonce + message |
| `POST` | `/api/auth/verify` | Verify signature, start session |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/auth/session` | Current session and profile |
| `GET` | `/api/v1/profiles/[address]` | Public profile |
| `PATCH` | `/api/v1/profiles/[address]` | Update own profile |
| `GET` | `/api/v1/communities` | List public communities |
| `POST` | `/api/v1/communities` | Create a community (owner) |
| `GET` | `/api/v1/communities/[id]` | Community detail |
| `GET` | `/api/v1/communities/[id]/members` | List members |
| `POST` | `/api/v1/communities/[id]/join` | Join a public community |
| `DELETE` | `/api/v1/communities/[id]/join` | Leave a community |
| `GET` | `/api/v1/communities/[id]/quests` | List quests |
| `POST` | `/api/v1/communities/[id]/quests` | Create a quest |
| `GET` | `/api/v1/communities/[id]/leaderboard` | EXP leaderboard (`?period=all\|week\|month`) |
| `GET` | `/api/v1/communities/[id]/moderation` | Pending submissions (moderators) |
| `GET` | `/api/v1/communities/[id]/badges` | List badge definitions |
| `POST` | `/api/v1/communities/[id]/badges` | Create a badge definition |
| `GET` | `/api/v1/quests/[id]` | Quest detail |
| `PATCH` | `/api/v1/quests/[id]` | Update a quest |
| `GET` | `/api/v1/quests/[id]/submissions` | List submissions (own, or all for moderators) |
| `POST` | `/api/v1/quests/[id]/submissions` | Submit proof of completion |
| `POST` | `/api/v1/submissions/[id]/review` | Approve or reject a submission |
| `POST` | `/api/v1/badges/[id]/award` | Award a badge to a wallet |
| `GET` | `/api/v1/reputation/[wallet]` | Reputation (`?community=<id\|slug>` to scope) |
| `POST` | `/api/v1/reputation/[wallet]` | Manual EXP adjustment (authorized only) |
| `GET` | `/api/v1/communities/[id]/proposals` | List proposals |
| `POST` | `/api/v1/communities/[id]/proposals` | Create a proposal |
| `GET` | `/api/v1/proposals/[id]` | Proposal detail with live tally |
| `PATCH` | `/api/v1/proposals/[id]` | Open, close, or cancel a proposal |
| `POST` | `/api/v1/proposals/[id]/vote` | Cast a vote (one per wallet) |
| `GET` | `/api/v1/proposals/[id]/results` | Tally, resolution, and vote history |
| `GET`/`POST` | `/api/v1/communities/[id]/treasury` | Read the treasury + balances; create it |
| `PATCH` | `/api/v1/communities/[id]/treasury` | Update the treasury reference or approval threshold |
| `GET`/`POST` | `/api/v1/communities/[id]/treasury/signers` | List / add treasury signers |
| `DELETE` | `/api/v1/communities/[id]/treasury/signers/[address]` | Remove a treasury signer |
| `GET`/`POST` | `/api/v1/communities/[id]/treasury/spending` | List / create spending proposals |
| `GET`/`POST` | `/api/v1/communities/[id]/treasury/transactions` | List / record verified transfers |
| `GET`/`PATCH`/`DELETE` | `/api/v1/treasury/spending/[id]` | Approval state; approve, reject, or cancel; withdraw own approval |
| `POST` | `/api/v1/treasury/spending/[id]/execute` | Record an approved spend after on-chain verification |
| `GET`/`POST` | `/api/v1/communities/[id]/treasury/rewards` | List / create reward distributions |
| `GET`/`PATCH` | `/api/v1/rewards/[id]` | Distribution detail with recipients; activate, cancel, or complete |
| `POST` | `/api/v1/rewards/[id]/recipients/[recipientId]` | Record a verified reward payout |
| `GET`/`PATCH` | `/api/v1/notifications` | List notifications / mark them read |
| `GET`/`POST` | `/api/v1/payment-requests` | List your requests / create one |
| `GET`/`PATCH` | `/api/v1/payment-requests/[id]` | Request detail / cancel it |
| `GET`/`POST` | `/api/v1/payments` | List payments / record a verified wallet-to-wallet payment |
| `GET`/`POST` | `/api/v1/api-keys` | List / create API keys |
| `DELETE` | `/api/v1/api-keys/[id]` | Revoke an API key |
| `GET`/`POST` | `/api/v1/webhooks` | List / create webhook endpoints |
| `PATCH`/`DELETE` | `/api/v1/webhooks/[id]` | Update / delete a webhook endpoint |
| `GET` | `/api/v1/webhooks/[id]/deliveries` | Recent deliveries for an endpoint |
| `POST` | `/api/v1/webhooks/dispatch` | Drain the retry queue (cron secret) |

`[id]` accepts a community UUID or slug.

Full request and response details, error codes, and the webhook event
catalogue are in [`docs/api.md`](./docs/api.md).

## Security model

- Wallet addresses are stored lowercase; EIP-55 casing is display-only.
- Nonces are single-use, time-limited (5 minutes), and consumed only after a
  successful signature check.
- Session cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- Authorization is enforced server-side in route handlers. RLS additionally
  protects direct database access: private communities are readable only by
  members, and the nonce and audit tables are not reachable with the anon key.
- The service-role key is used only in server code after explicit authorization
  checks.
- Votes are one per wallet per proposal, enforced both by a unique constraint and
  a server-side pre-check. Eligibility (minimum role), the voting window, and
  the proposal status are all re-checked server-side before a vote is stored;
  vote weight is never taken from the client.
- **Square Treasury and Square Pay are non-custodial.** The server never holds a
  key and has no code path that signs or sends a transaction. A user's wallet
  signs every transfer; the server only verifies the resulting receipt (token
  contract, sender, recipient, exact amount, and success) before recording it.
  Approving a spending proposal moves no funds.
- Payable tokens come from a **static allowlist** in `src/lib/treasury/tokens.ts`;
  a token address is never accepted from client input, which closes a class of
  spoofing attacks. Amounts are stored as text base-unit integers, never floats.
- **API keys are hashed.** Only a SHA-256 hash and a short prefix are stored; the
  plaintext key is returned once at creation. Lookups compare hashes in constant
  time. Revocation is immediate.
- **Webhook URLs are HTTPS only.** `isAllowedWebhookUrl` refuses localhost,
  `.internal`/`.local` hosts, and private IPv4 literals to blunt SSRF, and
  deliveries time out after 10 seconds.
- **The webhook retry queue is secret-gated.** `POST /api/v1/webhooks/dispatch`
  is disabled unless `CRON_SECRET` is configured, and then requires it.
- **Rate limiting is best-effort.** The in-process store is per-instance, so a
  multi-instance deployment scales the effective limit with the fleet; a shared
  store can replace it without changing call sites.

## Project structure

```
src/
  app/
    api/auth/            # nonce, verify, logout, session
    api/v1/              # communities, quests, submissions, reputation, badges, proposals, treasury, payments, api-keys, webhooks
    communities/         # explore, detail, new
      [slug]/quests/     # quest list and detail
      [slug]/leaderboard/
      [slug]/moderation/
      [slug]/proposals/  # proposal list and detail
      [slug]/treasury/   # treasury balances, spending, activity
      [slug]/pay/        # community payment requests
    pay/[requestId]/     # public payment-request pay page
    developers/          # developer portal (API keys, webhooks)
    profile/             # Square ID editor
    u/[address]/         # public profiles
  components/
    community/           # cards, create form, join/leave
    developer/           # API key and webhook managers
    gooddollar/          # GoodDollar identity panel, claim card, claim modal
    quest/               # quest card, create form, submit panel, moderation queue
    reputation/          # leaderboard and EXP badges
    governance/          # proposal card, create form, vote panel
    treasury/            # balances, treasury manager
    pay/                 # pay button, payment-request form, pay view
    profile/             # Square ID form
    ui/                  # accessible primitives (button, card, input, dialog, …)
    wallet/              # connect wallet button + wallet picker modal
  lib/
    api/                 # response helpers
    auth/                # wallet, nonce, session, service, use-auth
    community/           # community service + permission checks
    quest/               # quest and submission service
    reputation/          # EXP levels, reputation service, badges
    governance/          # proposal service + voting rules
    treasury/            # token registry, amounts, verification, spending, service
    pay/                 # payment status rules + service
    developer/           # API keys, rate limiting, webhooks, delivery queue
    gooddollar/          # GoodDollar config, read-only identity lookup, claim flow
    supabase/            # browser, server, service-role, middleware clients
    validation/          # zod schemas
    wallet/              # wallet picker labels + connect-error copy (pure)
    wagmi/               # Celo chain config + provider
supabase/migrations/     # SQL schema
docs/                    # API reference, architecture, deployment
sdk/                     # @goodsquare/sdk (standalone TypeScript SDK + examples)
```

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
npm test        # unit tests (node:test)
```

## Roadmap

- **Phase 1 — Foundation:** Square ID, communities, membership, API.
- **Phase 2 — Participation:** Square Quest and Square Reputation.
- **Phase 3 — Governance:** proposals, voting, quorum.
- **Phase 4 — Financial infrastructure:** Square Treasury and Square Pay.
  Non-custodial by design; a formal security review is still recommended before
  handling production funds at scale.
- **Phase 5 — Developer ecosystem (this release):** API keys, rate limiting,
  webhooks, a TypeScript SDK, public documentation, and runnable examples.
- **GoodDollar integration (this release):** optional citizen verification and
  daily G$ UBI claim on Square ID, Celo mainnet only. The claim runs in a modal
  that walks the two-signature (faucet then claim) flow.

### Next

- **Quest → reward link (this release).** A quest can optionally promise a
  token amount. Approving a submission queues the contributor as a recipient on
  a draft reward distribution for that quest, which a treasury signer then pays
  and the server verifies. It stays non-custodial: Good Square records the plan
  and never sends funds. A quest with no token reward keeps awarding EXP only.

## License

MIT — see [LICENSE](./LICENSE).
