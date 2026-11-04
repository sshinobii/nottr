# NOTTR

Wallet privacy intelligence for Robinhood Chain. This is an incomplete product under development; do not treat it as production-ready.

## Local development

Use Node.js 20.9 or newer. Run `npm install`, copy `.env.example` to `.env.local`, fill in the values described below, and run `npm run dev`. Open the local URL printed by Next.js. `npm run build` checks the production build and `npm test` runs the relationship analysis tests.

## Manual Supabase setup

1. Create a new Supabase project for NOTTR in your chosen organization and region.
2. In SQL Editor, run the complete SQL in `supabase/migrations/20261104071042_scan_history.sql` once. It creates the history table with row-level security and denies direct browser access; the server enforces per-user access. This migration is intended for a new empty project.
3. Copy the Project URL and a server secret key from the project's Connect / API Keys settings into `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The secret key bypasses RLS and must remain server-side; never prefix it with `NEXT_PUBLIC_`, commit it or share it in chat.
4. Create a Privy application, enable Email and Wallet login, and add your local and deployment domains to its allowed domains. Copy the app ID to `NEXT_PUBLIC_PRIVY_APP_ID` and its verification public key to `PRIVY_VERIFICATION_KEY`. For one-line environment values use literal `\n` between PEM lines. The server validates token signature, issuer, audience and expiry with Privy's SDK before any database access.
5. Create an Alchemy app for Robinhood Chain mainnet and set its API key as the server-only `ALCHEMY_API_KEY`. Without this key the server uses the public Blockscout endpoint, which may block automated requests. The Alchemy path requires a provider account and has not yet been validated with a real API key.
6. On Vercel, add the same variables in Project Settings → Environment Variables for the appropriate environments and redeploy. Do not commit `.env.local` or share secret keys in chat.

Once configured, Privy handles email and wallet login. Successful scans performed while signed in save the searched address and timestamp to the account's history. The server uses the verified Privy user ID to scope every database operation; the table is not exposed to browser roles. The latest 20 history entries can be selected for a fresh scan; the Account screen can clear all history. Scan results themselves are not saved. Public scanning does not require sign-in. An email login alone does not prove control of any wallet.

## Current scope and limitations

The public scanner validates EVM addresses and queries only Robinhood Chain. The Alchemy adapter checks chain ID 4663 and requests up to 50 incoming and 50 outgoing native and ERC-20 transfers; contract calls and internal transfers are excluded. The Blockscout adapter requests one page of transactions and excludes token and internal transfers. Coverage is partial and results link to the explorer. Direct relationships are summaries of returned records, not evidence of common ownership.

Privacy Score is unavailable until its methodology and coverage are validated. Full pagination, graph visualization, saved verified wallets, private reports, payment verification, subscriptions, monitoring, token entitlements, email alerts, AI, admin tools, rate limiting, account export and security review are not implemented. There are no buyback or burn executors. External service connectivity, Web3 sign-in and row-level security have not been tested against a configured Supabase project. Do not deploy as a production service until the remaining features and controls are implemented and independently tested.

NOTTR does not make wallets anonymous or guarantee privacy. It does not aggregate other networks.
