<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Good Square — repository notes for agents

## What this is
Open-source, modular community infrastructure on **Celo**. Phase 1 (Foundation)
is implemented here: Square ID, communities, membership, roles, and a versioned
REST API. Quest, Reputation, Governance, Treasury/Pay are later phases.

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

## Data model (supabase/migrations/0001_phase1_foundation.sql)
- `profiles` — Square ID, keyed by lowercase wallet address.
- `communities` — slug-unique, `visibility` public|private, `member_count`
  maintained by a trigger.
- `community_members` — unique `(community_id, address)`, role check constraint.
- `auth_nonces` — single-use, 5-minute login nonces (service-role only).
- `audit_logs` — append-only; not readable with the anon key.

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

## Not implemented yet (return 501 explicitly)
`/api/v1/reputation/[wallet]` (Phase 2), `/api/v1/payments` (Phase 4). Do not
return mock data for these.
