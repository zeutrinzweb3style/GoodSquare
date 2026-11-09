-- Good Square — Phase 1 (Foundation) schema
-- Covers: Square ID (profiles), communities, membership, roles, audit log,
-- and the wallet-auth nonce store.
--
-- Conventions:
--   * wallet addresses are stored lowercase (normalized) for reliable comparison
--   * UUID primary keys, timestamptz columns, foreign keys with explicit
--     delete behaviour, indexes, and unique constraints
--   * Row Level Security is enabled on every table
--
-- The application talks to Postgres through two Supabase clients:
--   * anon key  -> subject to the RLS policies below (reads + own-row writes)
--   * service role -> bypasses RLS and is only used after server-side
--     authorization checks in Next.js route handlers

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lowercase-normalized wallet address for the current JWT subject. The app
-- issues its own session cookie, so server code passes the address explicitly;
-- this helper exists for future Supabase-native auth integration.
create or replace function public.current_wallet()
returns text
language sql
stable
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'sub', '')), '');
$$;

-- ---------------------------------------------------------------------------
-- profiles  (Square ID)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  address       text primary key check (address = lower(address)),
  username      text not null unique,
  display_name  text,
  bio           text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_-]{3,32}$')
);

create index if not exists profiles_username_idx on public.profiles (lower(username));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- communities
-- ---------------------------------------------------------------------------
create table if not exists public.communities (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  logo_url        text,
  banner_url      text,
  visibility      text not null default 'public'
                    check (visibility in ('public', 'private')),
  creator_address text not null references public.profiles (address) on delete restrict,
  member_count    integer not null default 0 check (member_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint communities_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 48)
);

create index if not exists communities_visibility_idx on public.communities (visibility);
create index if not exists communities_creator_idx on public.communities (creator_address);
create index if not exists communities_created_at_idx on public.communities (created_at desc);

create trigger communities_set_updated_at
  before update on public.communities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- community_members
-- ---------------------------------------------------------------------------
create table if not exists public.community_members (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  address      text not null references public.profiles (address) on delete cascade,
  role         text not null default 'member'
                 check (role in ('owner', 'admin', 'moderator', 'contributor', 'member', 'visitor')),
  joined_at    timestamptz not null default now(),
  unique (community_id, address)
);

create index if not exists community_members_address_idx
  on public.community_members (address);
create index if not exists community_members_community_idx
  on public.community_members (community_id, role);

-- ---------------------------------------------------------------------------
-- auth_nonces  (wallet signature authentication)
-- ---------------------------------------------------------------------------
create table if not exists public.auth_nonces (
  id         uuid primary key default gen_random_uuid(),
  address    text not null check (address = lower(address)),
  nonce      text not null unique,
  message    text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_nonces_address_idx on public.auth_nonces (address);
create index if not exists auth_nonces_created_at_idx on public.auth_nonces (created_at);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor        text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  community_id uuid references public.communities (id) on delete set null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Membership counter maintenance
-- ---------------------------------------------------------------------------
create or replace function public.sync_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.communities
      set member_count = member_count + 1
      where id = new.community_id;
  elsif (tg_op = 'DELETE') then
    update public.communities
      set member_count = greatest(member_count - 1, 0)
      where id = old.community_id;
  end if;
  return null;
end;
$$;

drop trigger if exists community_members_sync_count on public.community_members;
create trigger community_members_sync_count
  after insert or delete on public.community_members
  for each row execute function public.sync_member_count();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.auth_nonces       enable row level security;
alter table public.audit_logs        enable row level security;

-- profiles: publicly readable; users may update only their own row.
-- Writes normally go through the service role after signature verification.
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (address = public.current_wallet())
  with check (address = public.current_wallet());

-- communities: public communities are readable by anyone; private ones only
-- by members. All writes require the service role (no anon policy), because
-- authorization depends on membership checks done in the backend.
drop policy if exists communities_read on public.communities;
create policy communities_read on public.communities
  for select using (
    visibility = 'public'
    or exists (
      select 1 from public.community_members m
      where m.community_id = communities.id
        and m.address = public.current_wallet()
    )
  );

-- community_members: readable for public communities or by fellow members.
drop policy if exists community_members_read on public.community_members;
create policy community_members_read on public.community_members
  for select using (
    exists (
      select 1 from public.communities c
      where c.id = community_members.community_id
        and c.visibility = 'public'
    )
    or exists (
      select 1 from public.community_members self
      where self.community_id = community_members.community_id
        and self.address = public.current_wallet()
    )
  );

-- auth_nonces: never readable or writable via the anon key. Only the service
-- role (used by the login route) touches this table.
-- (No policies are defined, so anon access is denied by default.)

-- audit_logs: append-only, not readable via the anon key.
-- (No policies are defined, so anon access is denied by default.)

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.communities to anon, authenticated;
grant select on public.community_members to anon, authenticated;
grant update on public.profiles to authenticated;
