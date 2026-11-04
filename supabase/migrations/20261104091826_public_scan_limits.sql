create table public.scan_rate_limits (
  client_key text not null check (client_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (client_key, window_start)
);
alter table public.scan_rate_limits enable row level security;
create index scan_rate_limits_window_idx on public.scan_rate_limits (window_start);
revoke all on public.scan_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.scan_rate_limits to service_role;

create function public.consume_scan_request(p_client_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare new_count integer;
begin
  if p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.scan_rate_limits where window_start < date_trunc('hour', now()) - interval '2 hours';
  insert into public.scan_rate_limits (client_key, window_start, request_count)
    values (p_client_key, date_trunc('hour', now()), 1)
  on conflict (client_key, window_start) do update
    set request_count = public.scan_rate_limits.request_count + 1
    where public.scan_rate_limits.request_count < 30
  returning request_count into new_count;
  return new_count is not null;
end;
$$;
revoke all on function public.consume_scan_request(text) from public, anon, authenticated;
grant execute on function public.consume_scan_request(text) to service_role;
