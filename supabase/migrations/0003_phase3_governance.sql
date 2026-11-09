-- Good Square — Phase 3 (Governance) schema
-- Covers: Square Governance (proposals, voting, and results).
--
-- Conventions match the earlier migrations:
--   * wallet addresses stored lowercase
--   * UUID primary keys, timestamptz, explicit foreign keys, indexes,
--     unique constraints, Row Level Security on every table
--   * one-wallet-one-vote for the MVP; the schema keeps a `weight` column so
--     reputation- or token-weighted voting can be added later without a rewrite

-- ---------------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id                  uuid primary key default gen_random_uuid(),
  community_id        uuid not null references public.communities (id) on delete cascade,
  title               text not null,
  description         text,
  status              text not null default 'draft'
                        check (status in ('draft', 'active', 'closed', 'cancelled')),
  voting_starts_at    timestamptz,
  voting_ends_at      timestamptz,
  -- Minimum role required to vote. 'visitor' means any connected wallet.
  voter_role          text not null default 'member'
                        check (voter_role in (
                          'owner', 'admin', 'moderator', 'contributor', 'member', 'visitor'
                        )),
  -- Quorum is a share (0..100) of eligible members who must vote for the
  -- result to count. Approval threshold is a share of cast votes that must
  -- approve. Percentages keep the rule readable and portable.
  quorum_percent      integer not null default 0
                        check (quorum_percent between 0 and 100),
  approval_threshold  integer not null default 50
                        check (approval_threshold between 0 and 100),
  created_by          text not null references public.profiles (address) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint proposals_title_length check (char_length(title) between 3 and 140),
  constraint proposals_voting_window check (
    voting_ends_at is null
    or voting_starts_at is null
    or voting_ends_at > voting_starts_at
  )
);

create index if not exists proposals_community_idx
  on public.proposals (community_id, created_at desc);
create index if not exists proposals_status_idx
  on public.proposals (community_id, status);

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  address      text not null references public.profiles (address) on delete cascade,
  choice       text not null check (choice in ('for', 'against', 'abstain')),
  -- Weight is fixed at 1 for one-wallet-one-vote. Reserved for future
  -- reputation- or token-weighted voting; never trusted from the client.
  weight       integer not null default 1 check (weight >= 0),
  reason       text,
  created_at   timestamptz not null default now(),
  -- One vote per wallet per proposal.
  unique (proposal_id, address)
);

create index if not exists votes_proposal_idx
  on public.votes (proposal_id, choice);
create index if not exists votes_address_idx
  on public.votes (address, created_at desc);

-- ---------------------------------------------------------------------------
-- proposal_results  (derived tally, one row per proposal)
-- ---------------------------------------------------------------------------
create or replace view public.proposal_results as
  select
    p.id                                as proposal_id,
    p.community_id,
    p.status,
    p.voter_role,
    p.quorum_percent,
    p.approval_threshold,
    p.voting_starts_at,
    p.voting_ends_at,
    count(v.*)::integer                 as total_votes,
    coalesce(sum(case when v.choice = 'for'     then v.weight else 0 end), 0)::integer as votes_for,
    coalesce(sum(case when v.choice = 'against' then v.weight else 0 end), 0)::integer as votes_against,
    coalesce(sum(case when v.choice = 'abstain' then v.weight else 0 end), 0)::integer as votes_abstain
  from public.proposals p
  left join public.votes v on v.proposal_id = p.id
  group by p.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.proposals enable row level security;
alter table public.votes     enable row level security;

-- proposals: readable for public communities or by members of private ones.
drop policy if exists proposals_read on public.proposals;
create policy proposals_read on public.proposals
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = proposals.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = proposals.community_id
        and m.address = public.current_wallet()
    )
  );

-- votes: readable for public communities or by members. Individual votes are
-- public by design (transparent governance); the backend additionally enforces
-- eligibility before inserting.
drop policy if exists votes_read on public.votes;
create policy votes_read on public.votes
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = votes.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = votes.community_id
        and m.address = public.current_wallet()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.proposals         to anon, authenticated;
grant select on public.votes             to anon, authenticated;
grant select on public.proposal_results  to anon, authenticated;
