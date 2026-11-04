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
