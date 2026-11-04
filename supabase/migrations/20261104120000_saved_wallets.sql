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
