-- Privy identities are DIDs, not Supabase Auth UUIDs. Only the server may access this table.
create table public.scan_history (
  id bigint generated always as identity primary key,
  user_id text not null check (user_id like 'did:privy:%'),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  created_at timestamptz not null default now()
);

create index scan_history_user_created_idx on public.scan_history (user_id, created_at desc);
alter table public.scan_history enable row level security;
revoke all on public.scan_history from anon, authenticated;
grant select, insert, delete on public.scan_history to service_role;
grant usage on sequence public.scan_history_id_seq to service_role;
