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
