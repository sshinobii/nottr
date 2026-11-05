-- Robinhood Chain ERC-721/1155 permission inventory. Run after 20261105090000_approval_inventory.sql.
alter table public.saved_wallets add column nft_approval_next_block bigint not null default 0 check (nft_approval_next_block >= 0);
alter table public.saved_wallets add column nft_approval_window bigint not null default 100000000 check (nft_approval_window >= 1);
alter table public.saved_wallets add column nft_approval_head_block bigint;
alter table public.saved_wallets add column nft_approval_completed_at timestamptz;
alter table public.saved_wallets add column nft_approval_error_at timestamptz;

create table public.wallet_nft_approvals (
  wallet_id uuid not null references public.saved_wallets(id) on delete cascade,
  collection text not null check (collection ~ '^0x[0-9a-f]{40}$'),
  kind text not null check (kind in ('token', 'operator')),
  permission_key text not null,
  token_id text check (token_id ~ '^[0-9]+$'),
  spender text not null check (spender ~ '^0x[0-9a-f]{40}$'),
  standard text not null default 'unknown' check (standard in ('erc721', 'erc1155', 'unknown')),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  last_event_block bigint not null check (last_event_block >= 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked', 'unavailable')),
  checked_at timestamptz,
  primary key (wallet_id, collection, kind, permission_key),
  check ((kind = 'token' and token_id is not null and permission_key = token_id) or
         (kind = 'operator' and token_id is null and permission_key = spender))
);
create index wallet_nft_approvals_refresh_idx on public.wallet_nft_approvals(wallet_id, checked_at);
alter table public.wallet_nft_approvals enable row level security;
revoke all on public.wallet_nft_approvals from public, anon, authenticated;
grant select, insert, update, delete on public.wallet_nft_approvals to service_role;

update public.saved_wallets set next_check_at = now() where nft_approval_next_block = 0;
