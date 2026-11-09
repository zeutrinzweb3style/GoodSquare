# Architecture

Good Square is open-source, modular community infrastructure on
[Celo](https://celo.org). This document describes how the pieces fit together.
For phase-by-phase scope, see the project proposal.

## Guiding principles

- **Modular.** Each module (Square ID, Quest, Reputation, Governance, Treasury,
  Pay) works on its own and alongside the others.
- **Non-custodial.** The backend never holds a key and never sends a
  transaction. Every on-chain movement is signed by a user's own wallet; the
  server verifies the receipt and records it.
- **Exact amounts.** Amounts are stored and transported as text base-unit
  integers, never floats.
- **Server-enforced authorization.** RLS is defence in depth, not the only gate.

## Layers

```
src/app/                 Next.js App Router — pages and API routes
  api/v1/                Versioned REST API (auth, communities, quests,
                         governance, treasury, pay, rewards, notifications)
src/components/          UI, including primitives in components/ui/
src/lib/                 Domain logic
  auth/                  Wallet-signature sessions (nonce → verify → cookie)
  community/             Communities, membership, roles, audit log
  quests/, reputation/   Participation modules
  governance/            Proposals, voting, results
  treasury/              Balances, spending, approvals, tokens, amounts, verify
  pay/                   Payment requests and verified payments
  rewards/               Reward distributions and per-recipient payouts
  notifications/         In-app notifications
  api/, validation/      Response helpers and zod schemas
supabase/migrations/     Schema, RLS policies, grants
tests/                   Node test runner tests for pure rules
```

## Data model

| Table | Purpose |
| --- | --- |
| `profiles` | Square ID, keyed by lowercase wallet address |
| `communities` | Slug-unique communities, public or private |
| `community_members` | Membership and role per community |
| `auth_nonces` | Single-use login nonces (service-role only) |
| `audit_logs` | Append-only record of sensitive actions |
| `quests`, `quest_submissions`, `quest_approvals` | Square Quest |
| `reputation_events`, `badges`, `user_badges` | Square Reputation (append-only EXP) |
| `proposals`, `votes`, `proposal_results` | Square Governance |
| `treasuries`, `treasury_signers` | Square Treasury reference and signers |
| `treasury_spending_proposals`, `treasury_spending_approvals` | Spending intent and approvals |
| `treasury_transactions` | Verified on-chain movements in/out |
| `payment_requests`, `payments` | Square Pay |
| `reward_distributions`, `reward_recipients` | Community rewards |
| `notifications` | In-app notifications |

Amounts live in `text` columns holding a base-unit integer (e.g. `"1500000"`
for 1.5 USDC at 6 decimals).

## Auth flow

1. `POST /api/auth/nonce` returns a single-use message.
2. The wallet signs it.
3. `POST /api/auth/verify` verifies the signature with viem, consumes the
   nonce, and sets an httpOnly `gs_session` cookie signed with `SESSION_SECRET`.
4. A profile row is bootstrapped on first login.

Server code reads the session with `getSession()` and checks permissions with
`can` / `getRole` before acting.

## Financial flows

### Square Treasury

- A treasury is a public reference to a community wallet (`address`,
  `chain_id`). Good Square has no authority over the address.
- Balances are read live from the chain for the allowlisted tokens.
- A **spending proposal** is an off-chain record of intent. Approving it changes
  a status only.
- When a treasury names **signers**, a proposal becomes `approved` only after
  `approval_threshold` distinct signers approve it.
- A signer then sends the transaction from the treasury wallet and submits the
  hash. `verifyTransfer` checks the receipt (token contract, sender, recipient,
  exact amount) before the proposal is marked `executed` and the transaction is
  recorded.

### Square Pay

- A payment request is a shareable link (and QR code). Anyone can pay it.
- The payer's wallet sends the transfer; the server verifies the receipt and
  records the payment.

### Community rewards

- A **reward distribution** is a plan to pay several contributors in one token.
- It moves nothing until it is `active`. For each recipient, a treasury signer
  sends the transfer and submits the hash; the server verifies it, marks the
  recipient `paid`, and records the treasury transaction. When every recipient
  is paid or skipped the distribution completes.

## Security

- Authorization is enforced server-side on every route.
- RLS policies back it up at the database layer.
- The service-role key bypasses RLS and is used only in trusted server code.
- Sensitive actions are written to `audit_logs`.
- See `SECURITY.md` for the reporting process and the non-custodial guarantee.
