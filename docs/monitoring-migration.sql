begin;

-- 20261104120000_saved_wallets.sql
-- Saved public addresses are not proof of wallet ownership.
create table public.saved_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  slot smallint not null check (slot between 1 and 2),
  created_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_error_at timestamptz,
  last_result jsonb,
  unique (user_id, address),
  unique (user_id, slot)
);
create index saved_wallets_due_idx on public.saved_wallets (last_checked_at nulls first);
alter table public.saved_wallets enable row level security;
revoke all on public.saved_wallets from public, anon, authenticated;
grant select, insert, update, delete on public.saved_wallets to service_role;


-- 20261104121000_holder_slots.sql
-- Eligibility for slots 3-10 is verified server-side against a Privy-linked wallet.
alter table public.saved_wallets drop constraint saved_wallets_slot_check;
alter table public.saved_wallets add constraint saved_wallets_slot_check check (slot between 1 and 10);


-- 20261104122000_wallet_monitoring.sql
alter table public.saved_wallets add column lease_until timestamptz;
alter table public.saved_wallets add column next_check_at timestamptz not null default now();
create index saved_wallets_next_check_idx on public.saved_wallets(next_check_at);

-- Observed counterparties are public records; associations with a user remain private.
create table public.wallet_observations (
  wallet_id uuid not null references public.saved_wallets(id) on delete cascade,
  counterparty text not null check (counterparty ~ '^0x[0-9a-f]{40}$'),
  evidence_hash text not null check (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  first_observed_at timestamptz not null default now(),
  primary key(wallet_id, counterparty)
);
-- Empty until an operator adds a verified, Robinhood-specific source. A blank
-- registry means unavailable coverage, never a clean bill of health.
create table public.risk_indicators (
  id uuid primary key default gen_random_uuid(),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  title text not null check (length(title) between 1 and 160),
  source_url text not null check (source_url ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(address, source_url)
);
create table public.wallet_alerts (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.saved_wallets(id) on delete cascade,
  signal_key text not null,
  kind text not null check (kind in ('privacy', 'risk')),
  counterparty text not null check (counterparty ~ '^0x[0-9a-f]{40}$'),
  evidence_hash text not null check (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  title text not null,
  source_url text,
  created_at timestamptz not null default now(),
  unique(wallet_id, signal_key)
);
create index wallet_alerts_wallet_created_idx on public.wallet_alerts(wallet_id, created_at desc);
alter table public.wallet_observations enable row level security;
alter table public.risk_indicators enable row level security;
alter table public.wallet_alerts enable row level security;
revoke all on public.wallet_observations, public.risk_indicators, public.wallet_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.wallet_observations, public.risk_indicators, public.wallet_alerts to service_role;

create function public.claim_wallet_checks(batch_size integer)
returns setof public.saved_wallets language sql set search_path = '' as $$
  update public.saved_wallets w set lease_until = now() + interval '5 minutes'
  where w.id in (
    select id from public.saved_wallets
    where next_check_at <= now() and (lease_until is null or lease_until < now())
    order by next_check_at, id for update skip locked limit least(greatest(batch_size, 1), 10)
  ) returning w.*;
$$;
revoke all on function public.claim_wallet_checks(integer) from public, anon, authenticated;
grant execute on function public.claim_wallet_checks(integer) to service_role;

create function public.complete_wallet_check(p_id uuid, p_observations jsonb, p_result jsonb)
returns void language plpgsql set search_path = '' as $$
declare was_checked boolean;
begin
  select last_checked_at is not null into was_checked from public.saved_wallets where id = p_id for update;
  if not found then return; end if;
  with incoming as (
    select distinct on (value->>'address') value->>'address' as address, value->>'hash' as hash
    from jsonb_array_elements(p_observations)
    where value->>'address' ~ '^0x[0-9a-f]{40}$' and value->>'hash' ~ '^0x[0-9a-f]{64}$'
  ), added as (
    insert into public.wallet_observations(wallet_id,counterparty,evidence_hash)
    select p_id, address, hash from incoming on conflict do nothing returning *
  )
  insert into public.wallet_alerts(wallet_id,signal_key,kind,counterparty,evidence_hash,title)
  select p_id, 'privacy:' || counterparty, 'privacy', counterparty, evidence_hash, 'Newly observed direct connection'
  from added where was_checked on conflict do nothing;

  insert into public.wallet_alerts(wallet_id,signal_key,kind,counterparty,evidence_hash,title,source_url)
  select p_id, 'risk:' || risk.id::text, 'risk', obs.counterparty, obs.evidence_hash, risk.title, risk.source_url
  from public.wallet_observations obs join public.risk_indicators risk on risk.address = obs.counterparty and risk.active
  where obs.wallet_id = p_id on conflict do nothing;

  update public.saved_wallets set last_checked_at = now(), last_error_at = null, last_result = p_result,
    next_check_at = ((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC', lease_until = null where id = p_id;
end;
$$;
revoke all on function public.complete_wallet_check(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_wallet_check(uuid,jsonb,jsonb) to service_role;


-- 20261104124000_transaction_history.sql
-- Historical explorer pages are checkpointed separately from daily scans.
alter table public.saved_wallets add column history_cursor jsonb;
alter table public.saved_wallets add column history_pages integer not null default 0;
alter table public.saved_wallets add column history_completed_at timestamptz;
alter table public.saved_wallets add column history_error_at timestamptz;

create function public.record_history_page(p_id uuid, p_observations jsonb, p_cursor jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.saved_wallets where id = p_id for update;
  if not found then return; end if;
  insert into public.wallet_observations(wallet_id,counterparty,evidence_hash)
  select distinct on (value->>'address') p_id, value->>'address', value->>'hash'
  from jsonb_array_elements(p_observations)
  where value->>'address' ~ '^0x[0-9a-f]{40}$' and value->>'hash' ~ '^0x[0-9a-f]{64}$'
  on conflict do nothing;

  insert into public.wallet_alerts(wallet_id,signal_key,kind,counterparty,evidence_hash,title,source_url)
  select p_id, 'risk:' || risk.id::text, 'risk', obs.counterparty, obs.evidence_hash, risk.title, risk.source_url
  from public.wallet_observations obs join public.risk_indicators risk on risk.address = obs.counterparty and risk.active
  where obs.wallet_id = p_id on conflict do nothing;

  update public.saved_wallets set history_cursor = p_cursor, history_pages = history_pages + 1,
    history_completed_at = case when p_cursor is null then now() else null end,
    history_error_at = null, lease_until = null,
    next_check_at = case when p_cursor is null then next_check_at else now() end
  where id = p_id;
end;
$$;
revoke all on function public.record_history_page(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_history_page(uuid,jsonb,jsonb) to service_role;


-- 20261104125000_approval_signals.sql
-- Deterministic risk signal based on a verified current ERC-20 allowance.
-- This does not classify the spender as malicious and coverage is bounded.
create function public.record_approval_signals(p_id uuid, p_approvals jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.saved_wallets where id = p_id for update;
  if not found then return; end if;
  insert into public.wallet_alerts(wallet_id,signal_key,kind,counterparty,evidence_hash,title)
  select p_id, 'approval:' || (value->>'token') || ':' || (value->>'spender'),
    'privacy', value->>'spender', value->>'transaction', 'Unlimited token permission observed'
  from jsonb_array_elements(p_approvals)
  where value->'unlimited' = 'true'::jsonb
    and value->>'token' ~ '^0x[0-9a-f]{40}$'
    and value->>'spender' ~ '^0x[0-9a-f]{40}$'
    and value->>'transaction' ~ '^0x[0-9a-f]{64}$'
  on conflict do nothing;
end;
$$;
revoke all on function public.record_approval_signals(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_approval_signals(uuid,jsonb) to service_role;


commit;
