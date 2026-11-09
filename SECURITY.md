# Security Policy

Good Square is non-custodial infrastructure for community funds. Security is a
first-class concern. We welcome reports and will credit reporters who ask to be
named.

## Reporting a vulnerability

Do **not** open a public issue for a security problem. Instead, report it
privately:

- Open a private security advisory on the GitHub repository
  (`Security` → `Report a vulnerability`), or
- Email the maintainers if the repository lists a contact.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected versions or commit, and any suggested fix.

We aim to acknowledge a report within a few days and to keep you updated as we
work on a fix.

## Scope

In scope:

- Authentication and session handling (wallet signatures, nonces, cookies).
- Authorization and permission checks, including RLS policy gaps.
- Anything that could let the backend move funds. It must never be able to.
- Verification of on-chain transfers (`verifyTransfer`) and amount handling.
- Injection, SSRF, and other classic web vulnerabilities.

Out of scope:

- Issues in third-party dependencies with no Good Square-specific impact.
- Spam or social engineering.
- Findings that require a compromised device or wallet.

## Non-custodial guarantee

Good Square never holds a private key and never sends a transaction. Every
on-chain movement is signed by a user's own wallet; the server only verifies a
receipt and records it. A change that adds a server-side send path, or that
stores key material, is a security defect. Report it.

## Handling secrets

- Never commit secrets or credentials. `.env.local` is git-ignored.
- The Supabase service-role key bypasses RLS. Use it only in trusted server code.
- Never log private keys, seed phrases, or full session tokens.

## Deployment caution

Do not deploy to mainnet without explicit authorization and a security review.
See `docs/deployment.md`.
