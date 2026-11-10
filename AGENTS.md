<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Good Square — repository notes for agents

## What this is
Open-source, modular community infrastructure on **Celo**. Phase 1 (Foundation),
Phase 2 (Participation), Phase 3 (Governance), Phase 4 (Financial
infrastructure), and Phase 5 (Developer ecosystem) are implemented here: Square
ID, communities, membership, roles, Square Quest, Square Reputation, Square
Governance, Square Treasury, Square Pay, community rewards, notifications, API
keys, webhooks, a versioned REST API, and optional GoodDollar identity + UBI on
Square ID.

## Golden rules
- **No native token, no speculative tokenomics.** EXP is a reputation metric
  with no monetary value.
- **Non-custodial.** Never request, store, or log private keys or seed phrases.
- **Audit sensitive actions.** Write to `audit_logs` for creates/joins/leaves.
- **Enforce authorization server-side.** RLS is defence in depth, not the only
  gate. The service-role key bypasses RLS — use it only in trusted server code.
- **Reputation is community-specific by default.**

## Stack
Next.js 16 (App Router, Turbopack, **Cache Components enabled**) · React 19 ·
TypeScript · Tailwind v4 · wagmi + viem · Supabase (Postgres + RLS) · jose · zod.

## Commands
```bash
npm run dev      # dev server
npm run build    # production build (runs typecheck)
npm run lint     # eslint
npm run test     # node --test on tests/**/*.test.ts (native TS type stripping)
npx next typegen # regenerate route types after adding pages/routes
```

## Important Next.js 16 notes (this version has breaking changes)
- `next.config.ts` sets `cacheComponents: true`.
  - `export const dynamic = "force-dynamic"` is **not allowed** — the build
    fails. Instead, read request-time data inside a `<Suspense>` boundary and
    `await connection()` from `next/server` before the database/session access.
- Route and page prop types (`PageProps<"/path">`, `RouteContext<"/api/...">`)
  are generated. Run `npx next typegen` after adding routes or `tsc` will fail
  with "does not satisfy the constraint".
- `middleware` is replaced by **`proxy.ts`** (exports `proxy` + `config`).
- `cookies()`/`headers()`/`params` are async — always `await` them.

## Data model
### Phase 1 (supabase/migrations/0001_phase1_foundation.sql)
- `profiles` — Square ID, keyed by lowercase wallet address.
- `communities` — slug-unique, `visibility` public|private, `member_count`
  maintained by a trigger.
- `community_members` — unique `(community_id, address)`, role check constraint.
- `auth_nonces` — single-use, 5-minute login nonces (service-role only).
- `audit_logs` — append-only; not readable with the anon key.

### Phase 2 (supabase/migrations/0002_phase2_participation.sql)
- `quests` — per-community tasks; `exp_reward`, `category`, `status`,
  `deadline`; `submission_count` maintained by a trigger. Migration 0008 adds
  an optional reward promise (`reward_token_symbol`, `reward_amount`), set
  together or not at all.
- `quest_submissions` — unique `(quest_id, address)` prevents duplicate
  submissions; `status` pending|approved|rejected. `reward_recipient_id`
  (migration 0008) points at the queued payout for an approved submission.
- `quest_approvals` — immutable review history (append-only).
- `reputation_events` — append-only EXP ledger; `community_reputation` view
  derives per-community totals.
- `badges` / `user_badges` — community-scoped achievement definitions and awards
  (unique `(badge_id, address)`).

### Phase 3 (supabase/migrations/0003_phase3_governance.sql)
- `proposals` — title, description, `status` (draft|active|closed|cancelled),
  voting window, `voter_role` (minimum eligible role), `quorum_percent`,
  `approval_threshold`.
- `votes` — unique `(proposal_id, address)` prevents duplicate voting; `choice`
  for|against|abstain; `weight` fixed at 1 (reserved for future weighting).
- `proposal_results` — view deriving per-proposal tallies (never stored).

### Phase 4 (supabase/migrations/0004_phase4_financial.sql)
- `treasuries` — one public reference per community (`address`, `chain_id`,
  `is_active`). Good Square has no authority over the address.
- `treasury_spending_proposals` — off-chain records of intent; approving does
  not move funds. `status` pending|approved|rejected|executed|cancelled.
- `treasury_transactions` — verified on-chain movements in/out; unique
  `(chain_id, tx_hash, token_symbol, from_address, to_address)`.
- `payment_requests` — Square Pay requests (`community_id` nullable for
  wallet-level requests); `status` open|paid|cancelled.
- `payments` — verified wallet-to-wallet transfers; unique `(chain_id, tx_hash)`.

### Phase 4 completion (supabase/migrations/0005_phase4_financial_completion.sql)
- `treasuries.approval_threshold` — how many distinct signers must approve a
  spending proposal when signers exist (default 1).
- `treasury_signers` — wallets authorized to approve spending; unique
  `(treasury_id, address)`. Signers never gain custody.
- `treasury_spending_approvals` — one row per signer approval; unique
  `(proposal_id, approver)`. Distinct signers are counted.
- `reward_distributions` — a plan to pay several contributors in one token;
  `status` draft|active|completed|cancelled. `quest_id` (migration 0008) links
  a plan to the quest it settles; a partial unique index allows one open plan
  per quest.
- `reward_recipients` — one row per payee; unique `(distribution_id, address)`;
  `status` pending|paid|skipped. `treasury_transactions.reward_recipient_id`
  links a payout to its transaction, and `source` may be `reward`.
- `notifications` — in-app notifications; private to the recipient.

### Phase 5 (supabase/migrations/0006_phase5_developer.sql)
- `api_keys` — bearer credentials for integrations. Only `key_hash` (SHA-256)
  and a short `key_prefix` are stored; the plaintext key is shown once.
- `webhook_endpoints` — a subscribed URL, its signing secret, and the events it
  wants. `community_id` null means the owner's events across communities.
- `webhook_deliveries` — one row per attempted delivery, with the exact signed
  payload, attempt count, and next retry time.

Amounts are stored as **text holding a base-unit integer** (e.g. `"1500000"`
for 1.5 USDC at 6 decimals) so no precision is lost through JSON.

## Auth flow
`POST /api/auth/nonce` -> wallet signs the returned message -> `POST
/api/auth/verify` verifies with viem, consumes the nonce, sets an httpOnly
`gs_session` cookie signed with `SESSION_SECRET`. A profile row is bootstrapped
on first login.

`getSession()` also accepts an API key: a request with `Authorization: Bearer
<api key>` is resolved to its owner before the cookie is consulted. API keys are
verified with a constant-time comparison of their SHA-256 hash, so a leaked
database row is not usable.

## Wallet connection
Connecting a wallet and signing in are **two separate steps**: connecting only
proves the wallet is present, while the signature proves ownership. The header
control (`src/components/wallet/connect-wallet-button.tsx`) opens a picker when
disconnected, auto-prompts the sign-in once after a fresh connect (guarded by
`isLoading` so an existing session wins), and falls back to a manual "Sign in to
continue" button when the person dismisses or rejects the prompt.

Connectors live in `src/lib/wagmi/config.ts`: `injected()` always, plus
`walletConnect()` only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, so a
missing id degrades to the browser wallet instead of crashing. `injected()` only
works in a desktop browser with an extension; phones and in-app browsers need
WalletConnect. Keep picker labels and connect-error copy in
`src/lib/wallet/connectors.ts` pure so `tests/wallet-connectors.test.ts` can
import them directly.

## Conventions
- Wallet addresses are stored **lowercase**; use `normalizeAddress` /
  `isValidAddress` from `src/lib/auth/wallet.ts`.
- Validate request bodies with zod schemas in `src/lib/validation/schemas.ts`.
- Return responses via helpers in `src/lib/api/response.ts`.
- Permission checks use `roleHasPermission` / `hasAtLeastRole` from
  `src/lib/permissions.ts`, or the community service in `src/lib/community/`.
- UI primitives live in `src/components/ui/` (hand-rolled, accessible, no
  shadcn CLI dependency).

## Not implemented yet
Nothing is stubbed with 501 any more. `/api/v1/payments` is live (Square Pay),
and Phase 5 added the developer surface (API keys, rate limiting, webhooks, SDK).

## Reputation rules (do not break these)
- EXP is **append-only** in `reputation_events`. Never update a total in place;
  always insert a new event and derive totals (the `community_reputation` view).
- Levels live in `src/lib/reputation/levels.ts` and must match the proposal:
  Newcomer 0–99, Contributor 100–499, Active Member 500–999, Builder 1,000–2,499,
  Ambassador 2,500–4,999, Champion 5,000+.
- Approving a quest submission awards `quest.exp_reward` exactly once (guarded
  by the submission's `pending` status), and is the only automatic EXP source.
- Rewards are never transferred automatically; a community defines its own
  validation and eligibility rules.

## Governance rules (do not break these)
- Voting is **one wallet, one vote**. Duplicate votes are prevented by the
  unique `(proposal_id, address)` constraint *and* a server-side pre-check.
- Re-check everything server-side before storing a vote: authentication,
  eligibility (`voter_role`), the proposal is `active`, and `isVotingOpen`.
  Never trust a client-supplied weight; it is always 1.
- Quorum counts every cast vote; approval is over decisive votes only, so
  abstentions never count for or against. Ties at the threshold pass (`>=`).
- Tallies come from the `proposal_results` view — never store an editable total.
- Pure rules live in `src/lib/governance/results.ts`; keep them I/O-free so the
  tests in `tests/governance.test.ts` can exercise them directly.
- Advanced (reputation- or token-weighted) voting must not be enabled until its
  eligibility and security rules are clearly defined.

## Treasury & Pay rules (do not break these)
- **Non-custodial, always.** The backend never holds a key and never sends a
  transaction. Every on-chain movement is signed by a user's own wallet; the
  server only verifies a receipt and records it. There is no server-side send
  path — do not add one.
- **Approve ≠ pay.** Approving a spending proposal changes a status only. A
  signer must still send the transaction from the treasury wallet and submit the
  hash, which `verifyTransfer` checks against the approved terms before the
  proposal is marked `executed`.
- **Verify before recording.** Never trust a client-supplied hash. `verifyTransfer`
  (`src/lib/treasury/verify.ts`) must confirm a successful receipt, the token
  contract, sender, recipient, and exact amount. A payment is rejected unless
  every field matches.
- **Tokens are a static allowlist.** Only tokens in `src/lib/treasury/tokens.ts`
  can be displayed, requested, or paid. Never accept a token address from client
  input. Each address and its decimals were verified on-chain before commit.
- **Amounts are exact.** Store and transport amounts as **text base-unit
  integers**, never floats. Convert with `parseAmount`/`formatAmount` in
  `src/lib/treasury/amounts.ts`; the database stores `text` and never does
  arithmetic on amounts.
- Pure rules live in `src/lib/treasury/spending.ts`, `src/lib/pay/status.ts`,
  `src/lib/treasury/verification.ts`, `src/lib/treasury/amounts.ts`,
  `src/lib/treasury/approvals.ts`, `src/lib/rewards/rules.ts`, and
  `src/lib/treasury/tokens.ts`; keep them I/O-free so the tests in
  `tests/treasury.test.ts` and `tests/rewards.test.ts` can exercise them
  directly (these modules must not import other `src/` modules at runtime).
- **Multisig approvals never move funds either.** When a treasury names signers,
  `approval_threshold` distinct signers must approve a proposal before it turns
  `approved`. `src/lib/treasury/approvals.ts` holds the pure rules; only distinct
  signers count and a signer cannot approve twice.
- **Rewards follow the same non-custodial rule.** A `reward_distributions` row is
  a plan; each `reward_recipients` payout is only marked `paid` after
  `verifyTransfer` confirms the signer's receipt, and the distribution completes
  when no recipient is pending. Pure rules live in `src/lib/rewards/rules.ts`.
- **The quest → reward link queues a plan; it never pays.** When a quest promises
  a token (`reward_token_symbol` + `reward_amount`), approving a submission adds
  the contributor as a recipient on the quest's distribution — created as a
  `draft` on first approval and reused after. The approval must never fail
  because of the payout: a missing treasury or an unpayable token skips it and
  records the reason. Pure rules live in `src/lib/quest/reward.ts` (no runtime
  imports, so `tests/quest-reward.test.ts` can exercise them directly); the
  token allowlist there must stay equal to `TOKEN_SYMBOLS` in
  `src/lib/treasury/tokens.ts`, which a test asserts.
- **Notifications are a courtesy.** `notify` never fails the action it
  describes, and notifications never gate an action.

## GoodDollar integration rules (do not break these)
- **Mainnet only.** GoodDollar has no testnet deployment. This integration is
  gated to Celo mainnet (`42220`) by `isGoodDollarSupportedChain` in
  `src/lib/gooddollar/config.ts`. It must stay hidden on every other chain,
  including Celo Sepolia, and show a "Switch to Celo" prompt instead of failing
  silently.
- **Still non-custodial.** The UBI claim is a real mainnet transaction signed by
  the user's own wallet. The backend never holds a key and never sends anything.
  `src/lib/gooddollar/identity.ts` is read-only (public client only) and safe to
  call from an unauthenticated route.
- **Use the official SDK.** Identity and claim flows come from
  `@goodsdks/citizen-sdk` / `@goodsdks/react-hooks` — never hand-roll contract
  calls or invent addresses. Verified Celo mainnet addresses live in
  `GOODDOLLAR_CELO_CONTRACTS`; re-check them against the GoodProtocol deployment
  manifest before any production financial use.
- **Pure helpers stay I/O-free.** `src/lib/gooddollar/config.ts` holds chain
  guards, address maps, and `formatUnits`; keep it free of runtime imports so
  `tests/gooddollar.test.ts` can exercise it directly.
- **The claim flow is a pure reducer.** `src/lib/gooddollar/claim-flow.ts` owns
  the phases, view resolution, and countdown formatting for the two-signature
  claim modal. Keep it free of SDK and React imports so
  `tests/claim-flow.test.ts` can exercise it directly. The SDK's
  `onConfirmFaucetTx` callback is the only pre-flight consent gate and always
  fires once, so the modal must always ask before a possible top-up; never
  replace it with `window.confirm`.
- **The status endpoint is read-only and public.** `GET
  /api/v1/gooddollar/identity` returns identity state only; it never writes.

## Developer ecosystem rules (do not break these)
- **Never store or log a plaintext API key.** Only the SHA-256 hash and a short
  prefix go in the database. Compare with `apiKeyMatches` (constant-time). The
  full key is returned exactly once, at creation.
- **Rate limiting is per-instance and best-effort.** `src/lib/developer/rate-limit.ts`
  is pure; `rate-limit-store.ts` keeps timestamps in memory. Keep the pure
  module I/O-free so `tests/developer.test.ts` can exercise it. A shared store
  can replace the in-memory one without changing call sites.
- **Webhook emission never fails the action that triggered it.** `emitWebhookEvent`
  swallows its own errors and queues failed deliveries for retry. Never `await`
  a webhook in a way that can break a state change.
- **Webhook URLs are HTTPS only.** `isAllowedWebhookUrl` rejects localhost,
  `.internal`/`.local` hosts, and private IPv4 literals to blunt SSRF.
- **Signatures are HMAC-SHA256 over `<t>.<raw body>`.** The receiver must verify
  against the raw bytes before parsing JSON. `signPayload`/`verifySignature` are
  pure; the SDK's `verifyWebhookSignature` mirrors them with the Web Crypto API.
- **The retry queue is secret-gated.** `POST /api/v1/webhooks/dispatch` is
  disabled unless `CRON_SECRET` is set, and then requires it.
- **The SDK is a standalone package.** It lives in `sdk/` with its own
  `package.json` and `tsconfig.json`, is excluded from the root tsconfig and
  ESLint, and must not import from `src/`. Keep it dependency-free.
- **Docs live in `docs/api.md`.** Update it when routes, events, or error codes
  change.
- **G$ is a first-class token.** It lives in the registry (`src/lib/treasury/tokens.ts`,
  symbol `G$`, 18 decimals, Celo mainnet `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A`)
  and has no Celo Sepolia deployment, so it only appears on mainnet selectors.
  The UI derives its token lists from `payableTokens(chainId)`; never hardcode a
  token array in a component.
- **GoodDollar identity code stays pure where it can be tested.** `eligibility.ts`
  and `metrics.ts` have no SDK/network/`@/` imports (the Node test runner does not
  resolve extensionless relative imports). `gate.ts` and `activity.ts` are the
  thin server wrappers that touch the chain and Supabase.
- **Verified-humans-only is opt-in.** `communities.verified_only` and
  `quests.verified_only` (migration 0007) gate join and quest submission through
  `checkVerifiedHuman`. Defaults are false so existing rows are unaffected.
