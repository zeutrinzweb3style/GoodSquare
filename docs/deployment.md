# Deployment

Good Square is a Next.js app backed by Supabase (Postgres + RLS). This guide
covers a first deployment.

> **Do not deploy to mainnet without explicit authorization and a security
> review.** Start on Celo Sepolia (testnet, chain id `11142220`).

## Prerequisites

- Node.js 20 or newer.
- A Supabase project (for Postgres and the auth-agnostic data layer).
- A Celo RPC endpoint (the public Forno endpoints work for development).

## 1. Configure environment

Copy `.env.example` to `.env.local` (local) or set the variables in your hosting
provider. Never commit real secrets.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; bypasses RLS |
| `SESSION_SECRET` | Random string, 32+ characters (`openssl rand -base64 48`) |
| `NEXT_PUBLIC_CELO_CHAIN_ID` | `11142220` for Sepolia, `42220` for mainnet |
| `NEXT_PUBLIC_CELO_RPC_URL` | Celo mainnet RPC |
| `NEXT_PUBLIC_CELO_SEPOLIA_RPC_URL` | Celo Sepolia RPC |

## 2. Apply database migrations

Run the migrations in `supabase/migrations/` in order against your project:

```
0001_phase1_foundation.sql
0002_phase2_participation.sql
0003_phase3_governance.sql
0004_phase4_financial.sql
0005_phase4_financial_completion.sql
```

Use the Supabase SQL editor or the Supabase CLI:

```bash
supabase db push
```

Each migration enables Row Level Security and grants the minimum required
access. Verify the policies are active after applying them.

## 3. Build and run

```bash
npm ci
npm run build
npm start
```

`npm run build` runs the type check. A failing type check fails the build.

## 4. Verify

- Sign in with a wallet on Celo Sepolia and create a community.
- Open the community treasury, set a signer and an approval threshold, and
  create a spending proposal. Confirm it needs the threshold of approvals before
  it can be executed.
- Create a payment request and confirm the QR code and share link render.
- Create a reward distribution, activate it, and confirm a payout is only
  recorded after the on-chain receipt is verified.

## Operational notes

- The backend is non-custodial: it holds no keys and sends no transactions. Do
  not add a server-side send path.
- Only allowlisted tokens in `src/lib/treasury/tokens.ts` are payable. Each
  address and its decimals were verified on-chain before commit; re-verify
  before adding a token.
- Rotate `SESSION_SECRET` and the Supabase keys if they are ever exposed.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of the client bundle; it must only be
  read in server code.
