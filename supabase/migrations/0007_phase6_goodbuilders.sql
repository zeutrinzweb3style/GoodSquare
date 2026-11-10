
-- Good Square — Phase 6 (GoodBuilders Season 5)
-- Adds the "verified humans only" GoodDollar gate. When a community or a quest
-- has `verified_only = true`, only wallets the GoodDollar identity registry
-- recognises as verified citizens may join the community or submit the quest.
--
-- This is one of the six meaningful G$ integrations GoodBuilders accepts
-- ("use GoodDollar identity in a meaningful way, such as rewarding only
-- verified humans"). Defaults are false so nothing changes for existing rows.

alter table public.communities
  add column if not exists verified_only boolean not null default false;

alter table public.quests
  add column if not exists verified_only boolean not null default false;

comment on column public.communities.verified_only is
  'When true, only GoodDollar-verified wallets may join this community.';
comment on column public.quests.verified_only is
  'When true, only GoodDollar-verified wallets may submit this quest.';
