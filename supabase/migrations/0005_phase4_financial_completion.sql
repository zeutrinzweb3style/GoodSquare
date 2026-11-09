-- Good Square — Phase 4 completion schema
-- Adds the pieces the proposal lists for financial infrastructure that were not
-- in 0004: multisig-style treasury approvals, community reward distribution,
-- and the notifications table.
--
-- Conventions match the earlier migrations:
--   * wallet addresses stored lowercase
--   * UUID primary keys, timestamptz, explicit foreign keys, indexes,
--     unique constraints, Row Level Security on every table
--
-- Amounts remain text holding a base-unit integer. The non-custodial guarantee
-- is unchanged: the backend never holds keys and never sends a transaction. A
-- threshold being reached only flips a proposal to `approved`; a signer must
-- still send the transaction from their own wallet.

-- ---------------------------------------------------------------------------
-- treasuries: multisig-style approval threshold
-- ---------------------------------------------------------------------------
alter table public.treasuries
  add column if not exists approval_threshold integer not null default 1;

alter table public.treasuries
  drop constraint if exists treasuries_approval_threshold_positive;
alter table public.treasuries
  add constraint treasuries_approval_threshold_positive
  check (approval_threshold >= 1);

-- ---------------------------------------------------------------------------
-- treasury_transactions: allow reward payouts as a source
-- ---------------------------------------------------------------------------
alter table public.treasury_transactions
  drop constraint if exists treasury_transactions_source_check;
alter table public.treasury_transactions
  add constraint treasury_transactions_source_check
  check (source in ('spending', 'manual', 'reward'));

-- ---------------------------------------------------------------------------
-- treasury_signers
-- The wallets authorized to approve spending from a treasury. When a treasury
-- names signers, a proposal needs `approval_threshold` distinct signers to
-- become approved. Signers never gain custody: they can only approve, and a
-- signer still sends the transfer from the treasury wallet themselves.
-- ---------------------------------------------------------------------------
create table if not exists public.treasury_signers (
  id            uuid primary key default gen_random_uuid(),
  treasury_id   uuid not null references public.treasuries (id) on delete cascade,
  address       text not null check (address ~ '^0x[0-9a-f]{40}$'),
  added_by      text not null references public.profiles (address) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (treasury_id, address)
);

create index if not exists treasury_signers_treasury_idx
  on public.treasury_signers (treasury_id);

-- ---------------------------------------------------------------------------
-- treasury_spending_approvals
-- One row per signer approval. Distinct signers are counted; a signer cannot
-- approve twice (enforced by the unique constraint and a server-side check).
-- ---------------------------------------------------------------------------
create table if not exists public.treasury_spending_approvals (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.treasury_spending_proposals (id) on delete cascade,
  approver      text not null references public.profiles (address) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (proposal_id, approver)
);

create index if not exists spending_approvals_proposal_idx
  on public.treasury_spending_approvals (proposal_id);

-- ---------------------------------------------------------------------------
-- reward_distributions
-- A plan to pay several contributors from a community treasury in one token.
-- Non-custodial: Good Square records the plan and verifies each transfer a
-- signer makes; it never sends funds.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_distributions (
  id            uuid primary key default gen_random_uuid(),
  treasury_id   uuid not null references public.treasuries (id) on delete cascade,
  community_id  uuid not null references public.communities (id) on delete cascade,
  title         text not null,
  description   text,
  token_symbol  text not null,
  status        text not null default 'draft'
                  check (status in ('draft', 'active', 'completed', 'cancelled')),
  created_by    text not null references public.profiles (address) on delete restrict,
  activated_at  timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint reward_title_length check (char_length(title) between 3 and 140)
);

create index if not exists reward_distributions_community_idx
  on public.reward_distributions (community_id, created_at desc);
create index if not exists reward_distributions_treasury_idx
  on public.reward_distributions (treasury_id, created_at desc);

create trigger reward_distributions_set_updated_at
  before update on public.reward_distributions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reward_recipients
-- One row per payee in a distribution. Unique per distribution so the same
-- wallet is never paid twice within one plan.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_recipients (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.reward_distributions (id) on delete cascade,
  address         text not null check (address ~ '^0x[0-9a-f]{40}$'),
  amount          text not null check (amount ~ '^[1-9][0-9]*$'),
  status          text not null default 'pending'
                    check (status in ('pending', 'paid', 'skipped')),
  tx_hash         text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  paid_at         timestamptz,
  recorded_by     text references public.profiles (address) on delete set null,
  created_at      timestamptz not null default now(),
  unique (distribution_id, address)
);

create index if not exists reward_recipients_distribution_idx
  on public.reward_recipients (distribution_id, status);

-- Link a treasury transaction back to the reward payout it settles.
alter table public.treasury_transactions
  add column if not exists reward_recipient_id uuid
    references public.reward_recipients (id) on delete set null;

-- ---------------------------------------------------------------------------
-- notifications
-- Lightweight in-app notifications (proposal approved, payment received,
-- reward paid). Read-only to the recipient; written by trusted server code.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  address       text not null check (address ~ '^0x[0-9a-f]{40}$'),
  type          text not null,
  title         text not null,
  body          text,
  entity_type   text,
  entity_id     uuid,
  community_id  uuid references public.communities (id) on delete cascade,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_address_idx
  on public.notifications (address, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (address) where read_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.treasury_signers             enable row level security;
alter table public.treasury_spending_approvals  enable row level security;
alter table public.reward_distributions         enable row level security;
alter table public.reward_recipients            enable row level security;
alter table public.notifications                enable row level security;

-- Signers are part of the public transparency record for public communities.
drop policy if exists treasury_signers_read on public.treasury_signers;
create policy treasury_signers_read on public.treasury_signers
  for select using (
    exists (
      select 1 from public.treasuries t
      join public.communities c on c.id = t.community_id
      where t.id = treasury_signers.treasury_id and c.visibility = 'public'
    )
    or exists (
      select 1 from public.treasuries t
      join public.community_members m on m.community_id = t.community_id
      where t.id = treasury_signers.treasury_id
        and m.address = public.current_wallet()
    )
  );

-- Approvals are visible to anyone who can see the proposal.
drop policy if exists spending_approvals_read on public.treasury_spending_approvals;
create policy spending_approvals_read on public.treasury_spending_approvals
  for select using (
    exists (
      select 1 from public.treasury_spending_proposals p
      join public.communities c on c.id = p.community_id
      where p.id = treasury_spending_approvals.proposal_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.treasury_spending_proposals p
      join public.community_members m on m.community_id = p.community_id
      where p.id = treasury_spending_approvals.proposal_id
        and m.address = public.current_wallet()
    )
  );

drop policy if exists reward_distributions_read on public.reward_distributions;
create policy reward_distributions_read on public.reward_distributions
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = reward_distributions.community_id and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = reward_distributions.community_id
        and m.address = public.current_wallet()
    )
  );

drop policy if exists reward_recipients_read on public.reward_recipients;
create policy reward_recipients_read on public.reward_recipients
  for select using (
    address = public.current_wallet()
    or exists (
      select 1 from public.reward_distributions d
      join public.communities c on c.id = d.community_id
      where d.id = reward_recipients.distribution_id and c.visibility = 'public'
    )
    or exists (
      select 1 from public.reward_distributions d
      join public.community_members m on m.community_id = d.community_id
      where d.id = reward_recipients.distribution_id
        and m.address = public.current_wallet()
    )
  );

-- Notifications are private to their recipient.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select using (address = public.current_wallet());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (address = public.current_wallet())
  with check (address = public.current_wallet());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.treasury_signers            to anon, authenticated;
grant select on public.treasury_spending_approvals to anon, authenticated;
grant select on public.reward_distributions        to anon, authenticated;
grant select on public.reward_recipients           to anon, authenticated;
grant select, update on public.notifications       to anon, authenticated;
