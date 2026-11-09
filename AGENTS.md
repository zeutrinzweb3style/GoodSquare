<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Good Square — repository notes for agents

## What this is
Open-source, modular community infrastructure on **Celo**. Phase 1 (Foundation),
Phase 2 (Participation), Phase 3 (Governance), and Phase 4 (Financial
infrastructure) are implemented here: Square ID, communities, membership, roles,
Square Quest, Square Reputation, Square Governance, Square Treasury, Square Pay,
and a versioned REST API.

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
  `deadline`; `submission_count` maintained by a trigger.
- `quest_submissions` — unique `(quest_id, address)` prevents duplicate
  submissions; `status` pending|approved|rejected.
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

Amounts are stored as **text holding a base-unit integer** (e.g. `"1500000"`
for 1.5 USDC at 6 decimals) so no precision is lost through JSON.

## Auth flow
`POST /api/auth/nonce` -> wallet signs the returned message -> `POST
/api/auth/verify` verifies with viem, consumes the nonce, sets an httpOnly
`gs_session` cookie signed with `SESSION_SECRET`. A profile row is bootstrapped
on first login.

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
Nothing is stubbed with 501 any more. `/api/v1/payments` is live (Square Pay).

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
  `src/lib/treasury/verification.ts`, `src/lib/treasury/amounts.ts`, and
  `src/lib/treasury/tokens.ts`; keep them I/O-free so the tests in
  `tests/treasury.test.ts` can exercise them directly (these modules must not
  import other `src/` modules at runtime).
