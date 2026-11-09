-- Good Square — Phase 4 (Financial infrastructure) schema
-- Covers: Square Treasury (transparent community funds) and Square Pay
-- (non-custodial payments and payment requests).
--
-- Conventions match the earlier migrations:
--   * wallet addresses stored lowercase
--   * UUID primary keys, timestamptz, explicit foreign keys, indexes,
--     unique constraints, Row Level Security on every table
--
-- Amounts are stored as text holding a base-unit integer (e.g. "1500000" for
-- 1.5 USDC at 6 decimals). Storing base units avoids every floating-point
-- rounding issue, and storing them as text keeps full uint256 precision intact
-- through the JSON API (numeric columns can be coerced to JSON numbers by the
-- database layer). The application converts decimal strings to base units; the
-- database never does arithmetic on them.
--
-- Non-custodial guarantee: the backend never holds keys and never sends a
-- transaction. It only records treasury references, spending proposals,
-- verified transfers, and payment requests. Every on-chain movement is signed
-- by a user's own wallet.

-- ---------------------------------------------------------------------------
-- treasuries  (one reference per community)
-- ---------------------------------------------------------------------------
create table if not exists public.treasuries (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null unique references public.communities (id) on delete cascade,
  name          text not null default 'Community Treasury',
  -- The treasury contract (or a multisig / EOA) that holds the funds. It is a
  -- public reference only: Good Square has no authority over it.
  address       text,
  chain_id      integer not null default 42220,
  is_active     boolean not null default true,
  created_by    text not null references public.profiles (address) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint treasuries_name_length check (char_length(name) between 1 and 80),
  constraint treasuries_address_format check (
    address is null or address ~ '^0x[0-9a-f]{40}$'
  )
);

create trigger treasuries_set_updated_at
  before update on public.treasuries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- treasury_spending_proposals
-- Off-chain records of intent. Approval does not move funds; execution records
-- a transaction that a signer already sent from their own wallet.
-- ---------------------------------------------------------------------------
create table if not exists public.treasury_spending_proposals (
  id            uuid primary key default gen_random_uuid(),
  treasury_id   uuid not null references public.treasuries (id) on delete cascade,
  community_id  uuid not null references public.communities (id) on delete cascade,
  title         text not null,
  description   text,
  token_symbol  text not null,
  amount        text not null check (amount ~ '^[1-9][0-9]*$'),
  recipient     text not null check (recipient ~ '^0x[0-9a-f]{40}$'),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  -- Optional link to a governance proposal that authorizes the spend.
  proposal_id   uuid references public.proposals (id) on delete set null,
  proposed_by   text not null references public.profiles (address) on delete restrict,
  decided_by    text references public.profiles (address) on delete set null,
  decided_at    timestamptz,
  executed_tx_hash text,
  executed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint spending_title_length check (char_length(title) between 3 and 140)
);

create index if not exists spending_treasury_idx
  on public.treasury_spending_proposals (treasury_id, created_at desc);
create index if not exists spending_status_idx
  on public.treasury_spending_proposals (community_id, status);

create trigger spending_set_updated_at
  before update on public.treasury_spending_proposals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- treasury_transactions  (verified on-chain movements, in and out)
-- ---------------------------------------------------------------------------
create table if not exists public.treasury_transactions (
  id            uuid primary key default gen_random_uuid(),
  treasury_id   uuid not null references public.treasuries (id) on delete cascade,
  community_id  uuid not null references public.communities (id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  token_symbol  text not null,
  amount        text not null check (amount ~ '^[1-9][0-9]*$'),
  from_address  text not null check (from_address ~ '^0x[0-9a-f]{40}$'),
  to_address    text not null check (to_address ~ '^0x[0-9a-f]{40}$'),
  chain_id      integer not null,
  tx_hash       text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_number  bigint,
  -- 'spending' when it settles a spending proposal, 'manual' otherwise.
  source        text not null default 'manual' check (source in ('spending', 'manual')),
  spending_proposal_id uuid references public.treasury_spending_proposals (id) on delete set null,
  recorded_by   text references public.profiles (address) on delete set null,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- One row per transfer; the same transaction cannot be recorded twice.
  unique (chain_id, tx_hash, token_symbol, from_address, to_address)
);

create index if not exists treasury_tx_treasury_idx
  on public.treasury_transactions (treasury_id, created_at desc);

-- ---------------------------------------------------------------------------
-- payment_requests  (Square Pay)
-- A payee (community or wallet) asks to be paid. Fulfilment is a direct
-- wallet-to-wallet transfer that the payer signs; Good Square only records it.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  -- Null for a wallet-level request that is not tied to a community.
  community_id  uuid references public.communities (id) on delete cascade,
  created_by    text not null references public.profiles (address) on delete cascade,
  payee_address text not null check (payee_address ~ '^0x[0-9a-f]{40}$'),
  chain_id      integer not null default 42220,
  token_symbol  text not null,
  amount        text not null check (amount ~ '^[1-9][0-9]*$'),
  memo          text,
  status        text not null default 'open'
                  check (status in ('open', 'paid', 'cancelled')),
  paid_tx_hash  text,
  paid_by       text references public.profiles (address) on delete set null,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payment_requests_memo_length check (memo is null or char_length(memo) <= 280)
);

create index if not exists payment_requests_community_idx
  on public.payment_requests (community_id, created_at desc);
create index if not exists payment_requests_payee_idx
  on public.payment_requests (payee_address, status);
create index if not exists payment_requests_created_by_idx
  on public.payment_requests (created_by, created_at desc);

create trigger payment_requests_set_updated_at
  before update on public.payment_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments  (verified transfers that fulfil or stand alone)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities (id) on delete set null,
  payment_request_id uuid references public.payment_requests (id) on delete set null,
  payer_address text not null check (payer_address ~ '^0x[0-9a-f]{40}$'),
  payee_address text not null check (payee_address ~ '^0x[0-9a-f]{40}$'),
  chain_id      integer not null,
  token_symbol  text not null,
  amount        text not null check (amount ~ '^[1-9][0-9]*$'),
  tx_hash       text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_number  bigint,
  status        text not null default 'verified'
                  check (status in ('pending', 'verified', 'failed')),
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- A transaction hash can only be recorded once.
  unique (chain_id, tx_hash)
);

create index if not exists payments_payer_idx
  on public.payments (payer_address, created_at desc);
create index if not exists payments_payee_idx
  on public.payments (payee_address, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.treasuries                 enable row level security;
alter table public.treasury_spending_proposals enable row level security;
alter table public.treasury_transactions      enable row level security;
alter table public.payment_requests           enable row level security;
alter table public.payments                   enable row level security;

-- Treasuries and their activity are public by design (transparent funds) for
-- public communities, and visible to members of private ones.
drop policy if exists treasuries_read on public.treasuries;
create policy treasuries_read on public.treasuries
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = treasuries.community_id and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = treasuries.community_id
        and m.address = public.current_wallet()
    )
  );

drop policy if exists spending_read on public.treasury_spending_proposals;
create policy spending_read on public.treasury_spending_proposals
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = treasury_spending_proposals.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = treasury_spending_proposals.community_id
        and m.address = public.current_wallet()
    )
  );

drop policy if exists treasury_tx_read on public.treasury_transactions;
create policy treasury_tx_read on public.treasury_transactions
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = treasury_transactions.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = treasury_transactions.community_id
        and m.address = public.current_wallet()
    )
  );

-- Payment requests: readable when tied to a public community, or by the payee
-- and creator. Wallet-level requests are visible to those two parties.
drop policy if exists payment_requests_read on public.payment_requests;
create policy payment_requests_read on public.payment_requests
  for select using (
    (community_id is not null and exists (
      select 1 from public.communities c
      where c.id = payment_requests.community_id and c.visibility = 'public'
    ))
    or payee_address = public.current_wallet()
    or created_by = public.current_wallet()
    or (community_id is not null and exists (
      select 1 from public.community_members m
      where m.community_id = payment_requests.community_id
        and m.address = public.current_wallet()
    ))
  );

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    (community_id is not null and exists (
      select 1 from public.communities c
      where c.id = payments.community_id and c.visibility = 'public'
    ))
    or payer_address = public.current_wallet()
    or payee_address = public.current_wallet()
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.treasuries                  to anon, authenticated;
grant select on public.treasury_spending_proposals to anon, authenticated;
grant select on public.treasury_transactions       to anon, authenticated;
grant select on public.payment_requests            to anon, authenticated;
grant select on public.payments                    to anon, authenticated;
