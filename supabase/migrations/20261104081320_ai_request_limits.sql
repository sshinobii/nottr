create table public.ai_request_limits (
  user_id text not null check (user_id like 'did:privy:%'),
  hour_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, hour_start)
);
alter table public.ai_request_limits enable row level security;
revoke all on public.ai_request_limits from public, anon, authenticated;
grant select, insert, update on public.ai_request_limits to service_role;

create function public.consume_ai_request(p_user_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare new_count integer;
begin
  if p_user_id is null or p_user_id not like 'did:privy:%' then
    return false;
  end if;
  insert into public.ai_request_limits (user_id, hour_start, request_count)
    values (p_user_id, date_trunc('hour', now()), 1)
  on conflict (user_id, hour_start) do update
    set request_count = public.ai_request_limits.request_count + 1
    where public.ai_request_limits.request_count < 5
  returning request_count into new_count;
  return new_count is not null;
end;
$$;
revoke all on function public.consume_ai_request(text) from public, anon, authenticated;
grant execute on function public.consume_ai_request(text) to service_role;
