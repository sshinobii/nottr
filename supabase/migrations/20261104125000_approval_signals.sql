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
