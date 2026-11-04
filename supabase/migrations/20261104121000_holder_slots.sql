-- Eligibility for slots 3-10 is verified server-side against a Privy-linked wallet.
alter table public.saved_wallets drop constraint saved_wallets_slot_check;
alter table public.saved_wallets add constraint saved_wallets_slot_check check (slot between 1 and 10);
