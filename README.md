# NOTTR

Wallet privacy intelligence for Robinhood Chain. This is an incomplete product under development; do not treat it as production-ready.

## Local development

Use Node.js 20.9 or newer. Run `npm install`, copy `.env.example` to `.env.local`, fill in the values described below, and run `npm run dev`. Open the local URL printed by Next.js. `npm run build` checks the production build and `npm test` runs the relationship analysis tests.

## Manual Supabase setup

1. Create a new Supabase project for NOTTR in your chosen organization and region.
2. In SQL Editor, run the complete SQL from each file in `supabase/migrations/`, in filename order, once each. They create server-only tables for history, future product features and AI request limits. These migrations are intended for a new empty project and have not been applied or tested on a live database.
3. Copy the Project URL and a server secret key from the project's Connect / API Keys settings into `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The secret key bypasses RLS and must remain server-side; never prefix it with `NEXT_PUBLIC_`, commit it or share it in chat.
4. Create a Privy application, enable Email and Wallet login, and add your local and deployment domains to its allowed domains. Copy the app ID to `NEXT_PUBLIC_PRIVY_APP_ID` and its verification public key to `PRIVY_VERIFICATION_KEY`. For one-line environment values use literal `\n` between PEM lines. The server validates token signature, issuer, audience and expiry with Privy's SDK before any database access.
5. Create an Alchemy app for Robinhood Chain mainnet and set its API key as the server-only `ALCHEMY_API_KEY`. Without this key the server uses the public Blockscout endpoint, which may block automated requests. The Alchemy path requires a provider account and has not yet been validated with a real API key.
6. Create an OpenAI API key and add it as the server-only `OPENAI_API_KEY`. Optionally set `OPENAI_MODEL` to `gpt-6.1-terra` (default) or `gpt-6-luna`; the selected model must be enabled for your OpenAI project. AI uses the Responses API with storage disabled. A signed-in user can make at most five AI requests per hour; the database limit must be configured or the endpoint remains unavailable. The AI request refreshes the chain data and sends the wallet address, question, derived signals, evidence, score and coverage to OpenAI after the user presses Ask NOTTR.
7. On Vercel, add the same variables in Project Settings → Environment Variables for the appropriate environments and redeploy. Do not commit `.env.local` or share secret keys in chat.

Once configured, Privy handles email and wallet login. Successful scans performed while signed in save the searched address and timestamp to the account's history. The server uses the verified Privy user ID to scope every database operation; the table is not exposed to browser roles. The latest 20 history entries can be selected for a fresh scan; the Account screen can export up to 10,000 history records as JSON or clear all history. Scan results themselves are not saved. Public scanning does not require sign-in. An email login alone does not prove control of any wallet.

## Current scope and limitations

The public scanner validates EVM addresses and queries only Robinhood Chain. The Alchemy adapter checks chain ID 4663 and requests up to 50 incoming and 50 outgoing native and ERC-20 transfers; contract calls and internal transfers are excluded. If Alchemy is unavailable, the scanner attempts Blockscout and identifies the fallback in its coverage message. The Blockscout adapter requests one page of transactions and excludes token and internal transfers. Coverage is partial and results link to the explorer. The graph shows up to eight direct relationships summarized from returned records, not evidence of common ownership.

Privacy Score v1 is an experimental, deterministic connectivity heuristic applied to the returned sample. It starts at 100 and deducts up to 30 points for distinct counterparties, 30 for repeated counterparties, and 20 for the largest counterparty's transaction concentration. It requires at least five distinct transactions involving other addresses. It has not been calibrated or independently validated and must not be interpreted as an anonymity or security guarantee. The method version, factor contributions and coverage appear with the scan; no score is produced when evidence is insufficient.

The optional AI analyst generates an interpretation of a fresh scan, with no tools or ability to change the score. The response is an interpretation, not evidence. It requires sign-in, OpenAI and a database quota; it has not been tested with live credentials. Full pagination, saved verified wallets, private reports, payment verification, subscriptions, monitoring, token entitlements, email alerts, admin tools, public scan rate limiting, full account export and security review are not implemented. The product database migration only prepares tables; no payments, purchases, monitoring or token benefits are enabled. There are no buyback or burn executors. External service connectivity, Privy sign-in and database access controls have not been tested against configured services. Do not deploy as a production service until the remaining features and controls are implemented and independently tested.

NOTTR does not make wallets anonymous or guarantee privacy. It does not aggregate other networks.
