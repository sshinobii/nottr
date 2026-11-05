-- Checkpointed, Robinhood-only ERC-20 Approval inventory for saved wallets.
alter table public.saved_wallets add column approval_next_block bigint not null default 0 check (approval_next_block >= 0);
alter table public.saved_wallets add column approval_window bigint not null default 100000000 check (approval_window >= 1);
alter table public.saved_wallets add column approval_head_block bigint;
alter table public.saved_wallets add column approval_completed_at timestamptz;
alter table public.saved_wallets add column approval_error_at timestamptz;

create table public.wallet_approvals (
  wallet_id uuid not null references public.saved_wallets(id) on delete cascade,
  token text not null check (token ~ '^0x[0-9a-f]{40}$'),
  spender text not null check (spender ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  last_event_block bigint not null check (last_event_block >= 0),
  allowance text check (allowance ~ '^[0-9]+$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'unlimited', 'revoked', 'unavailable')),
  checked_at timestamptz,
  primary key (wallet_id, token, spender)
);
create index wallet_approvals_refresh_idx on public.wallet_approvals(wallet_id, checked_at);
alter table public.wallet_approvals enable row level security;
revoke all on public.wallet_approvals from public, anon, authenticated;
grant select, insert, update, delete on public.wallet_approvals to service_role;

-- Existing saved wallets join the backfill on the next worker invocation.
update public.saved_wallets set next_check_at = now() where approval_next_block = 0;
