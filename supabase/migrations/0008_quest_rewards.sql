-- Good Square — Quest rewards (link an approved quest to a treasury payout)
--
-- A quest may optionally promise a token reward. When a moderator approves a
-- submission, the contributor is queued as a recipient on a draft reward
-- distribution for that quest. This stays non-custodial: the backend records
-- the plan and verifies the receipt a treasury signer submits; it never sends
-- funds. Quests without a token reward keep awarding EXP only.
--
-- Everything here is additive and defaults to null, so existing rows and the
-- EXP-only behaviour are unchanged.

-- ---------------------------------------------------------------------------
-- quests: an optional reward promise (both fields set, or neither)
-- ---------------------------------------------------------------------------
alter table public.quests
  add column if not exists reward_token_symbol text;
alter table public.quests
  add column if not exists reward_amount text;

alter table public.quests
  drop constraint if exists quests_reward_token_symbol_check;
alter table public.quests
  add constraint quests_reward_token_symbol_check
  check (
    reward_token_symbol is null
    or reward_token_symbol in ('CELO', 'cUSD', 'USDC', 'USDT', 'G$')
  );

-- A positive human decimal (e.g. "5" or "1.5"), never a float.
alter table public.quests
  drop constraint if exists quests_reward_amount_check;
alter table public.quests
  add constraint quests_reward_amount_check
  check (reward_amount is null or reward_amount ~ '^[0-9]+(\.[0-9]+)?$');

alter table public.quests
  drop constraint if exists quests_reward_pair_check;
alter table public.quests
  add constraint quests_reward_pair_check
  check ((reward_token_symbol is null) = (reward_amount is null));

comment on column public.quests.reward_token_symbol is
  'Optional token promised per approved submission; null means EXP only.';
comment on column public.quests.reward_amount is
  'Human decimal reward per approved submission, in reward_token_symbol units.';

-- ---------------------------------------------------------------------------
-- reward_distributions: the quest a distribution settles, when any
-- ---------------------------------------------------------------------------
alter table public.reward_distributions
  add column if not exists quest_id uuid
    references public.quests (id) on delete set null;

create index if not exists reward_distributions_quest_idx
  on public.reward_distributions (quest_id);

-- A quest has at most one open distribution. A new one may be created once the
-- previous plan is completed or cancelled.
create unique index if not exists reward_distributions_open_quest_idx
  on public.reward_distributions (quest_id)
  where quest_id is not null and status in ('draft', 'active');

comment on column public.reward_distributions.quest_id is
  'Set when the distribution settles a quest reward; null for hand-made plans.';

-- ---------------------------------------------------------------------------
-- quest_submissions: the queued payout for an approved submission
-- ---------------------------------------------------------------------------
alter table public.quest_submissions
  add column if not exists reward_recipient_id uuid
    references public.reward_recipients (id) on delete set null;

comment on column public.quest_submissions.reward_recipient_id is
  'The reward recipient queued by an approval, when the quest promised a token.';
