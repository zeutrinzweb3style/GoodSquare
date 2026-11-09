# Contributing to Good Square

Thanks for helping build open community infrastructure on Celo. This guide
covers how to set up the project, the conventions we follow, and how to send a
change.

## Getting started

```bash
git clone https://github.com/zeutrinzweb3style/GoodSquare.git
cd GoodSquare
npm install
cp .env.example .env.local   # fill in the values, see below
npm run dev
```

Required environment variables are documented in `.env.example`. Never commit
secrets; `.env.local` is git-ignored.

## Useful commands

```bash
npm run dev      # dev server
npm run build    # production build (runs the type check)
npm run lint     # eslint
npm run test     # node --test on tests/**/*.test.ts
npx next typegen # regenerate route types after adding pages or routes
```

Run `npx next typegen` whenever you add a page or an API route, otherwise `tsc`
fails with "does not satisfy the constraint".

## Architecture at a glance

- `src/lib/` holds pure rules and service functions. Pure rules (amounts,
  spending status, approvals, reward rules, verification) must stay I/O-free so
  they can be unit tested directly.
- `src/app/api/v1/` holds the versioned REST API. Every handler authenticates,
  checks permissions, validates with zod, and returns via the helpers in
  `src/lib/api/response.ts`.
- `src/components/` holds UI. Primitives live in `src/components/ui/`.
- `supabase/migrations/` holds the schema, RLS policies, and grants. Add a new
  numbered migration rather than editing an applied one.

See `docs/architecture.md` for the full picture.

## Conventions

- **TypeScript everywhere**, strict mode. No `any` without a comment explaining
  why.
- **Wallet addresses are stored lowercase.** Use `normalizeAddress` and
  `isValidAddress` from `src/lib/auth/wallet.ts`.
- **Amounts are text base-unit integers**, never floats. Convert with
  `parseAmount` / `formatAmount`.
- **Validate request bodies with zod** in `src/lib/validation/schemas.ts`.
- **Enforce authorization server-side.** RLS is defence in depth, not the only
  gate.
- **Audit sensitive actions** by writing to `audit_logs`.
- **Non-custodial, always.** Never request, store, or log private keys or seed
  phrases, and never add a server-side path that sends a transaction.

## Tests

Add a test for any new pure rule. Tests live in `tests/` and run with the Node
test runner and native TypeScript type stripping:

```bash
npm test
```

Keep pure modules free of runtime imports from other `src/` modules so tests can
import them directly.

## Commits and pull requests

- Keep commits focused and give them a clear message.
- Open a pull request against `main` with a short description of what changed
  and why.
- Make sure `npm run build`, `npm run lint`, and `npm test` pass before
  requesting review.
- Describe any on-chain or security-relevant behavior change explicitly.

## Security

Do not open a public issue for a security problem. Follow `SECURITY.md`.

## Code of conduct

By participating you agree to the `CODE_OF_CONDUCT.md`.

## License

By contributing you agree that your contributions are licensed under the MIT
License (see `LICENSE`).
