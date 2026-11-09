-- Good Square — Phase 2 (Participation) schema
-- Covers: Square Quest (quests, submissions, review history) and
-- Square Reputation (EXP events, badges, earned badges).
--
-- Conventions match 0001_phase1_foundation.sql:
--   * wallet addresses stored lowercase
--   * UUID primary keys, timestamptz, explicit foreign keys, indexes,
--     unique constraints, Row Level Security on every table
--   * the backend uses the service role after its own authorization checks;
--     RLS policies here are defence in depth for direct anon/authenticated use

-- ---------------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------------
create table if not exists public.quests (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities (id) on delete cascade,
  title            text not null,
  description      text,
  category         text not null default 'custom'
                     check (category in (
                       'social', 'participation', 'education',
                       'development', 'events', 'custom'
                     )),
  requirements     text,
  reward_info      text,
  status           text not null default 'active'
                     check (status in ('draft', 'active', 'closed')),
  deadline         timestamptz,
  exp_reward       integer not null default 0 check (exp_reward >= 0),
  created_by       text not null references public.profiles (address) on delete restrict,
  submission_count integer not null default 0 check (submission_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint quests_title_length check (char_length(title) between 3 and 120)
);

create index if not exists quests_community_idx
  on public.quests (community_id, created_at desc);
create index if not exists quests_status_idx
  on public.quests (status, deadline);

create trigger quests_set_updated_at
  before update on public.quests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quest_submissions
-- ---------------------------------------------------------------------------
create table if not exists public.quest_submissions (
  id           uuid primary key default gen_random_uuid(),
  quest_id     uuid not null references public.quests (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  address      text not null references public.profiles (address) on delete cascade,
  proof_url    text,
  proof_text   text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  text references public.profiles (address) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One submission per member per quest prevents duplicate submissions.
  unique (quest_id, address),
  constraint quest_submissions_proof_present
    check (proof_url is not null or proof_text is not null)
);

create index if not exists quest_submissions_quest_idx
  on public.quest_submissions (quest_id, status);
create index if not exists quest_submissions_address_idx
  on public.quest_submissions (address, created_at desc);
create index if not exists quest_submissions_community_idx
  on public.quest_submissions (community_id, status);

create trigger quest_submissions_set_updated_at
  before update on public.quest_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quest_approvals  (immutable review history)
-- ---------------------------------------------------------------------------
create table if not exists public.quest_approvals (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quest_submissions (id) on delete cascade,
  quest_id      uuid not null references public.quests (id) on delete cascade,
  community_id  uuid not null references public.communities (id) on delete cascade,
  reviewer      text not null references public.profiles (address) on delete restrict,
  decision      text not null check (decision in ('approved', 'rejected')),
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists quest_approvals_submission_idx
  on public.quest_approvals (submission_id, created_at desc);
create index if not exists quest_approvals_community_idx
  on public.quest_approvals (community_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reputation_events  (append-only EXP ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.reputation_events (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  address      text not null references public.profiles (address) on delete cascade,
  delta        integer not null check (delta <> 0),
  reason       text not null,
  source_type  text not null default 'manual'
                 check (source_type in ('quest', 'badge', 'manual', 'adjustment')),
  source_id    uuid,
  created_by   text references public.profiles (address) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists reputation_events_community_address_idx
  on public.reputation_events (community_id, address);
create index if not exists reputation_events_address_idx
  on public.reputation_events (address, created_at desc);
create index if not exists reputation_events_created_at_idx
  on public.reputation_events (created_at desc);

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
create table if not exists public.badges (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  slug         text not null,
  name         text not null,
  description  text,
  icon         text,
  created_by   text not null references public.profiles (address) on delete restrict,
  created_at   timestamptz not null default now(),
  constraint badges_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 48),
  constraint badges_name_length check (char_length(name) between 2 and 60),
  unique (community_id, slug)
);

create index if not exists badges_community_idx on public.badges (community_id);

-- ---------------------------------------------------------------------------
-- user_badges
-- ---------------------------------------------------------------------------
create table if not exists public.user_badges (
  id          uuid primary key default gen_random_uuid(),
  badge_id    uuid not null references public.badges (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  address     text not null references public.profiles (address) on delete cascade,
  awarded_by  text references public.profiles (address) on delete set null,
  awarded_at  timestamptz not null default now(),
  unique (badge_id, address)
);

create index if not exists user_badges_address_idx
  on public.user_badges (address, awarded_at desc);
create index if not exists user_badges_community_idx
  on public.user_badges (community_id, address);

-- ---------------------------------------------------------------------------
-- Submission counter maintenance
-- ---------------------------------------------------------------------------
create or replace function public.sync_submission_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.quests
      set submission_count = submission_count + 1
      where id = new.quest_id;
  elsif (tg_op = 'DELETE') then
    update public.quests
      set submission_count = greatest(submission_count - 1, 0)
      where id = old.quest_id;
  end if;
  return null;
end;
$$;

drop trigger if exists quest_submissions_sync_count on public.quest_submissions;
create trigger quest_submissions_sync_count
  after insert or delete on public.quest_submissions
  for each row execute function public.sync_submission_count();

-- ---------------------------------------------------------------------------
-- community_reputation  (derived EXP totals per member)
-- ---------------------------------------------------------------------------
create or replace view public.community_reputation as
  select
    community_id,
    address,
    coalesce(sum(delta), 0)::integer as exp,
    count(*)::integer               as event_count,
    max(created_at)                 as last_event_at
  from public.reputation_events
  group by community_id, address;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.quests              enable row level security;
alter table public.quest_submissions   enable row level security;
alter table public.quest_approvals     enable row level security;
alter table public.reputation_events   enable row level security;
alter table public.badges              enable row level security;
alter table public.user_badges         enable row level security;

-- quests: readable for public communities or by members of private ones.
drop policy if exists quests_read on public.quests;
create policy quests_read on public.quests
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = quests.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = quests.community_id
        and m.address = public.current_wallet()
    )
  );

-- quest_submissions: a member sees their own; moderators+ see all in the
-- community. Enforced in the backend for the service role; this policy covers
-- direct anon/authenticated access.
drop policy if exists quest_submissions_read on public.quest_submissions;
create policy quest_submissions_read on public.quest_submissions
  for select using (
    address = public.current_wallet()
    or exists (
      select 1 from public.community_members m
      where m.community_id = quest_submissions.community_id
        and m.address = public.current_wallet()
        and m.role in ('owner', 'admin', 'moderator')
    )
  );

-- reputation_events: readable for public communities or by members.
drop policy if exists reputation_events_read on public.reputation_events;
create policy reputation_events_read on public.reputation_events
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = reputation_events.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = reputation_events.community_id
        and m.address = public.current_wallet()
    )
  );

-- badges: public community badges are readable; private ones by members.
drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = badges.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = badges.community_id
        and m.address = public.current_wallet()
    )
  );

-- user_badges: same visibility rule as badges.
drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read on public.user_badges
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = user_badges.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = user_badges.community_id
        and m.address = public.current_wallet()
    )
  );

-- quest_approvals: no anon policy. Review history is served by the backend
-- after moderator checks. (Append-only, denied by default for anon.)

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.quests              to anon, authenticated;
grant select on public.badges              to anon, authenticated;
grant select on public.user_badges         to anon, authenticated;
grant select on public.reputation_events   to anon, authenticated;
grant select on public.quest_submissions   to anon, authenticated;
grant select on public.community_reputation to anon, authenticated;
