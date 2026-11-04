-- Server-only product records. Privy DIDs are verified in the application layer.
-- No table is exposed to anonymous or browser roles; service_role must filter by user_id.
create table public.verified_wallets (
  id bigint generated always as identity primary key,
  user_id text not null check (user_id like 'did:privy:%'),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  verified_at timestamptz not null default now(),
  unique (user_id, address),
  unique (id, user_id)
);

create table public.product_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.product_settings (key, value) values
  ('deep_scan', '{"enabled":false,"price_usd_cents":399}'::jsonb),
  ('pro', '{"enabled":false,"price_usd_cents":999}'::jsonb),
  ('buyback', '{"enabled":false,"allocation_basis_points":0}'::jsonb),
  ('token', '{"enabled":false,"chain_id":4663}'::jsonb);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  wallet_id bigint not null,
  product text not null check (product in ('deep_scan','pro')),
  chain_id integer not null check (chain_id = 4663),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  recipient text not null check (recipient ~ '^0x[0-9a-f]{40}$'),
  amount_base_units numeric(78,0) not null check (amount_base_units > 0),
  reference text not null unique,
  transaction_hash text unique check (transaction_hash is null or transaction_hash ~ '^0x[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','verified','expired','failed')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (wallet_id, user_id) references public.verified_wallets(id, user_id),
  unique (id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  wallet_id bigint not null,
  payment_id uuid unique,
  state text not null default 'pending' check (state in ('pending','ready','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (wallet_id, user_id) references public.verified_wallets(id, user_id),
  foreign key (payment_id, user_id) references public.payment_intents(id, user_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  status text not null check (status in ('active','expired','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  payment_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (payment_id, user_id) references public.payment_intents(id, user_id)
);

create table public.monitoring_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  wallet_id bigint not null,
  enabled boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_id),
  unique (id, user_id),
  foreign key (wallet_id, user_id) references public.verified_wallets(id, user_id)
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id like 'did:privy:%'),
  monitoring_job_id uuid not null,
  signal_key text not null,
  evidence jsonb not null,
  delivery_state text not null default 'pending' check (delivery_state in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  unique (monitoring_job_id, signal_key),
  foreign key (monitoring_job_id, user_id) references public.monitoring_jobs(id, user_id) on delete cascade
);

create table public.token_entitlements (
  user_id text not null check (user_id like 'did:privy:%'),
  wallet_id bigint not null,
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  balance_base_units numeric(78,0) not null check (balance_base_units >= 0),
  tier text not null,
  checked_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (user_id, wallet_id, token_address),
  foreign key (wallet_id, user_id) references public.verified_wallets(id, user_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  subject text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index payments_user_created_idx on public.payment_intents (user_id, created_at desc);
create index alerts_user_created_idx on public.alert_events (user_id, created_at desc);
create index subscriptions_user_ends_idx on public.subscriptions (user_id, ends_at desc);

alter table public.verified_wallets enable row level security;
alter table public.product_settings enable row level security;
alter table public.payment_intents enable row level security;
alter table public.reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.monitoring_jobs enable row level security;
alter table public.alert_events enable row level security;
alter table public.token_entitlements enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.verified_wallets, public.product_settings, public.payment_intents, public.reports, public.subscriptions, public.monitoring_jobs, public.alert_events, public.token_entitlements, public.audit_logs from public, anon, authenticated;
grant select, insert, update, delete on public.verified_wallets, public.product_settings, public.payment_intents, public.reports, public.subscriptions, public.monitoring_jobs, public.alert_events, public.token_entitlements, public.audit_logs to service_role;
grant usage on sequence public.verified_wallets_id_seq, public.audit_logs_id_seq to service_role;
