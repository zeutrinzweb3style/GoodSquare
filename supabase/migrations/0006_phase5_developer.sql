-- Good Square — Phase 5 developer infrastructure schema
-- Adds the pieces the proposal lists for the developer ecosystem:
-- API authentication (API keys), webhooks (endpoints + delivery log).
--
-- Conventions match the earlier migrations:
--   * wallet addresses stored lowercase
--   * UUID primary keys, timestamptz, explicit foreign keys, indexes,
--     unique constraints, Row Level Security on every table
--
-- Secrets are never stored in plaintext. An API key is shown once on creation;
-- only its SHA-256 hash and a short prefix are kept, so a leaked database row
-- cannot be used to call the API. A webhook signing secret is stored because
-- the server must sign outgoing payloads, and is readable only by its owner.

-- ---------------------------------------------------------------------------
-- api_keys
-- Long-lived bearer credentials for third-party integrations. The plaintext key
-- is returned once at creation; only `key_hash` (sha256) and `key_prefix` are
-- persisted. `scopes` limits what the key may do; an empty array means the key
-- inherits the owner's own permissions (read-mostly by convention).
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id             uuid primary key default gen_random_uuid(),
  owner_address  text not null check (owner_address = lower(owner_address)),
  name           text not null,
  key_prefix     text not null,
  key_hash       text not null unique,
  scopes         text[] not null default '{}',
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists api_keys_owner_idx on public.api_keys (owner_address);
create index if not exists api_keys_prefix_idx on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

-- Only the owner may see their keys; the hash is never exposed through the API.
drop policy if exists api_keys_read on public.api_keys;
create policy api_keys_read on public.api_keys
  for select using (owner_address = public.current_wallet());

-- ---------------------------------------------------------------------------
-- webhook_endpoints
-- A developer subscribes a URL to a set of events. When `community_id` is set
-- the endpoint only receives events for that community; when null it receives
-- the owner's events across communities.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_endpoints (
  id             uuid primary key default gen_random_uuid(),
  owner_address  text not null check (owner_address = lower(owner_address)),
  community_id   uuid references public.communities (id) on delete cascade,
  url            text not null,
  secret         text not null,
  events         text[] not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists webhook_endpoints_owner_idx
  on public.webhook_endpoints (owner_address);
create index if not exists webhook_endpoints_community_idx
  on public.webhook_endpoints (community_id);

drop trigger if exists webhook_endpoints_set_updated_at on public.webhook_endpoints;
create trigger webhook_endpoints_set_updated_at
  before update on public.webhook_endpoints
  for each row execute function public.set_updated_at();

alter table public.webhook_endpoints enable row level security;

drop policy if exists webhook_endpoints_read on public.webhook_endpoints;
create policy webhook_endpoints_read on public.webhook_endpoints
  for select using (owner_address = public.current_wallet());

drop policy if exists webhook_endpoints_update on public.webhook_endpoints;
create policy webhook_endpoints_update on public.webhook_endpoints
  for update using (owner_address = public.current_wallet())
  with check (owner_address = public.current_wallet());

drop policy if exists webhook_endpoints_delete on public.webhook_endpoints;
create policy webhook_endpoints_delete on public.webhook_endpoints
  for delete using (owner_address = public.current_wallet());

-- ---------------------------------------------------------------------------
-- webhook_deliveries
-- One row per attempted delivery. A delivery is retried with backoff until it
-- succeeds or the attempt budget is spent. The payload is the exact JSON body
-- that was (or will be) signed and sent, kept for inspection and replay.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  endpoint_id      uuid not null references public.webhook_endpoints (id) on delete cascade,
  event            text not null,
  payload          jsonb not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'delivered', 'failed')),
  attempts         integer not null default 0,
  response_status  integer,
  error            text,
  next_attempt_at  timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries (endpoint_id, created_at desc);
create index if not exists webhook_deliveries_pending_idx
  on public.webhook_deliveries (next_attempt_at) where status = 'pending';

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_read on public.webhook_deliveries;
create policy webhook_deliveries_read on public.webhook_deliveries
  for select using (
    exists (
      select 1 from public.webhook_endpoints e
      where e.id = webhook_deliveries.endpoint_id
        and e.owner_address = public.current_wallet()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.api_keys             to authenticated;
grant select, update, delete on public.webhook_endpoints  to authenticated;
grant select on public.webhook_deliveries   to authenticated;
